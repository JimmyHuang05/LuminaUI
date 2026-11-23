import asyncio
import json
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import AsyncMock, patch
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
import pe_chat


class ChatTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / 'chat.json'
        self.library = Path(self.tmp.name) / 'library.json'
        self.library.write_text('[]', encoding='utf-8')
        self.patches = [patch.object(pe_chat, 'PATH', self.path), patch.object(pe_chat, 'LIBRARY', self.library)]
        for p in self.patches: p.start()
        app = web.Application()
        app.router.add_route('*', '/chat', pe_chat.conversation)
        self.client = TestClient(TestServer(app))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()
        for p in self.patches: p.stop()
        self.tmp.cleanup()

    async def post(self, **kw):
        response = await self.client.post('/chat', json=kw)
        return response.status, await response.json()

    async def test_persist_followup_and_idempotent_retry(self):
        response = {'reply': '可以参考', 'draft': {'title': '雨中街角', 'prompt': '[Location]\nRainy street.'}, 'references': []}
        request_id = str(uuid.uuid4())
        with patch.object(pe_chat, 'answer', AsyncMock(return_value=response)) as model:
            status, state = await self.post(message='写个街景', request_id=request_id, revision=0)
            self.assertEqual(status, 200)
            self.assertEqual(len(pe_chat.load()['sessions'][0]['messages']), 2)
            self.assertEqual(pe_chat.load()['sessions'][0]['messages'][1]['draft'], response['draft'])
            _, duplicate = await self.post(message='写个街景', request_id=request_id, revision=0)
            self.assertEqual(duplicate, state)
            self.assertEqual(model.await_count, 1)
            await self.post(message='改为晴天', request_id=str(uuid.uuid4()), revision=state['revision'])
            self.assertEqual(len(model.call_args.args[1]), 2)
            self.assertEqual(model.call_args.args[1][1]['draft'], response['draft'])

    async def test_failed_message_survives_and_can_retry(self):
        rid = str(uuid.uuid4())
        with patch.object(pe_chat, 'answer', AsyncMock(side_effect=ValueError('连接失败'))):
            _, state = await self.post(message='你好', request_id=rid, revision=0)
        self.assertEqual(pe_chat.load()['sessions'][0]['messages'][0]['status'], 'error')
        with patch.object(pe_chat, 'answer', AsyncMock(return_value={'reply': '你好', 'draft': None, 'references': []})):
            _, state = await self.post(message='你好', request_id=rid, revision=state['revision'])
        self.assertEqual(len(state['messages']), 2)
        self.assertEqual(state['messages'][0]['status'], 'done')

    async def test_stale_tab_does_not_overwrite_history(self):
        pe_chat.save({'revision': 8, 'messages': []})
        with patch.object(pe_chat, 'answer', AsyncMock()) as model:
            code, _ = await self.post(message='hello', request_id=str(uuid.uuid4()), revision=0)
            self.assertEqual(code, 409)
            model.assert_not_awaited()
            self.assertEqual(pe_chat.load()['sessions'][0]['revision'], 8)

    async def test_restart_pending_is_retryable(self):
        pe_chat.save({'revision': 1, 'messages': [{'id': 'x', 'role': 'user', 'content': 'hello', 'status': 'pending'}]})
        self.assertEqual(pe_chat.snapshot()['messages'][0]['status'], 'error')

    async def test_retrieval_reads_only_selected_card_and_no_writes(self):
        rows = [{'id': 'a', 'title': '蓝色茶杯', 'prompt': '[Identity]\nBlue cup.'},
                {'id': 'b', 'title': '花园', 'prompt': '[Location]\nGarden.'}]
        output = {'reply': '已参考蓝色茶杯', 'draft': {'title': '红色茶杯', 'prompt': '[Identity]\nRed cup.'}}
        with patch.object(pe_chat.deepseek_client, 'complete', AsyncMock(side_effect=[json.dumps({'ids': ['a']}), json.dumps(output)])) as model:
            result = await pe_chat.answer('仿照蓝色茶杯写红色茶杯', [], rows)
            first = json.loads(model.call_args_list[0].args[0])
            second = json.loads(model.call_args_list[1].args[0])
            self.assertNotIn('prompt', first['library_titles'][0])
            self.assertEqual(second['reference_cards'], [rows[0]])
            self.assertEqual(result['references'], [{'id': 'a', 'title': '蓝色茶杯'}])
            self.assertEqual(rows[0]['prompt'], '[Identity]\nBlue cup.')

    async def test_unknown_reference_is_rejected(self):
        with patch.object(pe_chat.deepseek_client, 'complete', AsyncMock(return_value='{"ids":["missing"]}')):
            with self.assertRaisesRegex(ValueError, '参考'):
                await pe_chat.answer('hello', [], [])

    async def create_session(self):
        sid = str(uuid.uuid4())
        code, row = await self.post(action='create', session_id=sid)
        self.assertEqual(code, 200)
        return row

    async def test_migration_preserves_original_and_is_idempotent(self):
        original = {'revision': 4, 'messages': [{'id': 'old', 'role': 'user', 'content': '原始记录'}]}
        pe_chat.save(original)
        before = self.path.read_bytes()
        migrated = pe_chat.load()
        row = migrated['sessions'][0]
        self.assertEqual(row['title'], '历史对话')
        self.assertEqual(row['messages'], original['messages'])
        self.assertEqual(row['revision'], 4)
        self.assertEqual(self.path.with_suffix('.legacy.json').read_bytes(), before)
        self.assertEqual(pe_chat.load(), migrated)

    async def test_management_and_empty_store(self):
        row = await self.create_session()
        sid = row['id']
        _, duplicate = await self.post(action='create', session_id=sid)
        self.assertEqual(duplicate, row)
        await self.post(action='rename', session_id=sid, title='我的主题')
        _, data = await self.post(action='pin', session_id=sid, pinned=True)
        self.assertEqual(data['sessions'], [])
        with patch.object(pe_chat, 'answer', AsyncMock(return_value={'reply': '好', 'draft': None, 'references': []})):
            _, reply = await self.post(session_id=sid, message='第一条', request_id=str(uuid.uuid4()), revision=0)
        self.assertEqual(reply['title'], '我的主题')
        listing = await (await self.client.get('/chat?list=1')).json()
        self.assertEqual(listing['sessions'][0]['id'], sid)
        for session in list(pe_chat.load()['sessions']):
            await self.post(action='delete', session_id=session['id'])
        self.assertEqual(pe_chat.load()['sessions'], [])
        self.assertEqual((await self.client.get('/chat?session_id='+sid)).status, 404)
        self.assertEqual((await self.create_session())['messages'], [])

    async def test_parallel_sessions_isolated_and_rename_not_overwritten(self):
        a, b = await self.create_session(), await self.create_session()
        started, release = asyncio.Event(), asyncio.Event()
        async def respond(message, history, library, **kwargs):
            self.assertEqual(history, [])
            if message == '会话 A':
                started.set()
                await release.wait()
            return {'reply': message+' 回复', 'draft': None, 'references': []}
        with patch.object(pe_chat, 'answer', side_effect=respond):
            pending = asyncio.create_task(self.post(session_id=a['id'], message='会话 A', request_id=str(uuid.uuid4()), revision=0))
            await asyncio.wait_for(started.wait(), 2)
            try:
                code, _ = await self.post(action='delete', session_id=a['id'])
                self.assertEqual(code, 409)
                code, _ = await self.post(session_id=a['id'], message='重复', request_id=str(uuid.uuid4()), revision=1)
                self.assertEqual(code, 409)
                _, listing = await self.post(action='rename', session_id=a['id'], title='自定义标题')
                self.assertTrue(next(s for s in listing['sessions'] if s['id']==a['id'])['pending'])
                code, reply_b = await asyncio.wait_for(self.post(session_id=b['id'], message='会话 B', request_id=str(uuid.uuid4()), revision=0), 2)
                self.assertEqual(code, 200)
                self.assertEqual(reply_b['title'], '会话 B')
            finally:
                release.set()
            _, reply_a = await pending
        self.assertEqual(reply_a['title'], '自定义标题')
        rows = {s['id']: s for s in pe_chat.load()['sessions']}
        self.assertEqual([m['content'] for m in rows[a['id']]['messages']], ['会话 A', '会话 A 回复'])
        self.assertEqual([m['content'] for m in rows[b['id']]['messages']], ['会话 B', '会话 B 回复'])
        self.assertFalse(pe_chat.ACTIVE)

    async def test_stop_cancels_model_and_keeps_retryable_message(self):
        session = await self.create_session()
        started = asyncio.Event()
        cancelled = asyncio.Event()
        async def respond(message, history, library, **kwargs):
            kwargs['on_progress']('answering')
            started.set()
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()
        rid = str(uuid.uuid4())
        with patch.object(pe_chat, 'answer', side_effect=respond):
            task = asyncio.create_task(self.post(session_id=session['id'], message='等待', request_id=rid, revision=0))
            await asyncio.wait_for(started.wait(), 2)
            self.assertEqual(pe_chat.snapshot(session['id'])['phase'], 'answering')
            code, _ = await self.post(action='stop', session_id=session['id'], target_id='wrong')
            self.assertEqual(code, 409)
            code, data = await self.post(action='stop', session_id=session['id'], target_id=rid)
            self.assertTrue(data['stopping'])
            _, state = await asyncio.wait_for(task, 2)
        self.assertTrue(cancelled.is_set())
        self.assertEqual(state['messages'][-1]['status'], 'stopped')
        self.assertNotIn(session['id'], pe_chat.RUNS)
        self.assertNotIn(session['id'], pe_chat.ACTIVE)
        self.assertEqual(pe_chat.recent(state['messages']), [])
        with patch.object(pe_chat, 'answer', AsyncMock(return_value={'reply': '完成', 'draft': None, 'references': []})):
            _, state = await self.post(session_id=session['id'], message='等待', request_id=rid, revision=state['revision'])
        self.assertEqual(len(state['messages']), 2)

    async def test_branch_preserves_original_and_excludes_future_context(self):
        session = await self.create_session()
        with patch.object(pe_chat, 'answer', AsyncMock(return_value={'reply': '回答', 'draft': None, 'references': []})):
            _, first = await self.post(session_id=session['id'], message='第一问', request_id=str(uuid.uuid4()), revision=0)
            _, last = await self.post(session_id=session['id'], message='第二问', request_id=str(uuid.uuid4()), revision=first['revision'])
        target = last['messages'][3]['id']
        nid = str(uuid.uuid4())
        code, _ = await self.post(action='branch', session_id=session['id'], message_id=target, new_id=nid, revision=0)
        self.assertEqual(code, 409)
        _, branch = await self.post(action='branch', session_id=session['id'], message_id=target, new_id=nid, revision=last['revision'])
        self.assertEqual(branch['messages'], first['messages'])
        self.assertEqual(pe_chat.snapshot(session['id']), last)
        _, again = await self.post(action='branch', session_id=session['id'], message_id=target, new_id=nid, revision=last['revision'])
        self.assertEqual(branch, again)

    async def test_explicit_references_skip_automatic_selection(self):
        rows = [{'id': 'a', 'title': '茶杯', 'prompt': '[Identity] Cup.'}]
        phases = []
        with patch.object(pe_chat.deepseek_client, 'complete', AsyncMock(return_value=json.dumps({'reply': '完成', 'draft': None}))) as model:
            result = await pe_chat.answer('参考此卡', [], rows, reference_ids=['a'], on_progress=phases.append)
        self.assertEqual(model.await_count, 1)
        self.assertEqual(json.loads(model.call_args.args[0])['reference_cards'], rows)
        self.assertEqual(result['references'], [{'id': 'a', 'title': '茶杯'}])
        self.assertEqual(phases, ['answering'])

    async def test_saved_draft_link_survives_reload(self):
        session = await self.create_session()
        self.library.write_text(json.dumps([{'id': 'p', 'title': '茶杯', 'prompt': '[Identity] Cup.'}]), encoding='utf-8')
        reply = {'reply': '草稿', 'draft': {'title': '茶杯', 'prompt': '[Identity] Cup.'}, 'references': []}
        with patch.object(pe_chat, 'answer', AsyncMock(return_value=reply)) as model:
            _, data = await self.post(session_id=session['id'], message='写一个', request_id=str(uuid.uuid4()), revision=0, reference_ids=['p'])
        self.assertEqual(model.call_args.kwargs['reference_ids'], ['p'])
        mid = data['messages'][-1]['id']
        _, linked = await self.post(action='link_draft', session_id=session['id'], message_id=mid, prompt_id='p')
        self.assertEqual(pe_chat.snapshot(session['id'])['messages'][-1]['saved_prompt_id'], 'p')
        self.assertEqual(len(linked['messages']), 2)


    async def test_qwen_routes_locally_and_preserves_schema(self):
        responses = [{'choices': [{'message': {'content': json.dumps(value)}}]} for value in
                     ({'ids': []}, {'reply': '你好', 'draft': None})]
        with patch.object(pe_chat.local_vlm, 'complete', AsyncMock(side_effect=responses)) as local, \
             patch.object(pe_chat.deepseek_client, 'ClientSession', side_effect=AssertionError('Local inference must not contact cloud')) as cloud:
            result = await pe_chat.answer('你好', [], [], provider='qwen')
        cloud.assert_not_called()
        self.assertEqual(local.await_count, 2)
        self.assertEqual(result['model'], 'Qwen3.5-4B')
        self.assertEqual(result['reply'], '你好')
        self.assertIn('schema', local.call_args.args[0]['response_format'])

    async def test_retry_uses_original_provider(self):
        session = await self.create_session()
        rid = str(uuid.uuid4())
        with patch.object(pe_chat, 'answer', AsyncMock(side_effect=ValueError('连接失败'))) as model:
            _, state = await self.post(session_id=session['id'], message='你好', request_id=rid, revision=0, provider='qwen')
        self.assertEqual(model.call_args.kwargs['provider'], 'qwen')
        with patch.object(pe_chat, 'answer', AsyncMock(return_value={'reply': '你好', 'draft': None, 'references': []})) as model:
            await self.post(session_id=session['id'], message='你好', request_id=rid, revision=state['revision'], provider='deepseek')
        self.assertEqual(model.call_args.kwargs['provider'], 'qwen')

    async def test_qwen_truncated_reply_is_not_saved_as_success(self):
        with patch.object(pe_chat.local_vlm, 'complete', AsyncMock(return_value={'choices': [{'finish_reason': 'length', 'message': {'content': '{}'}}]})):
            with self.assertRaisesRegex(ValueError, '未完成'):
                await pe_chat.answer('你好', [], [], provider='qwen')

if __name__ == '__main__': unittest.main()
