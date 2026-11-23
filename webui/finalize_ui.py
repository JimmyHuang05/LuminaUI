from pathlib import Path
p=Path(__file__).with_name('index.html')
s=p.read_text(encoding='utf-8')
s=s.replace("if(p){$('progress').max", "if(p&&job.status==='running'){$('progress').max")
s=s.replace("b.className='history-card';if(j.images.length)","b.className='history-card'+(j.prompt_id===selected?' active':'');if(j.images.length)")
s=s.replace("select(j)};$('history').append(b)","select(j);document.querySelectorAll('.history-card').forEach(c=>c.classList.toggle('active',c===b))};$('history').append(b)")
s=s.replace('<title>蓝鲸 · 图像工作室</title>','<title>蓝鲸工作台</title>')
p.write_text(s,encoding='utf-8')
