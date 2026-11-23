"""Strict LoRA loading for the local workbench's generation workflows."""
import hashlib
from pathlib import Path

import folder_paths
import nodes

_digests = {}


class GenerationLoraLoader(nodes.LoraLoader):
    @classmethod
    def INPUT_TYPES(cls):
        inputs = super().INPUT_TYPES()
        inputs['required']['file_sha256'] = ('STRING', {'default': ''})
        return inputs

    def load_lora(self, model, clip, lora_name, strength_model, strength_clip, file_sha256):
        path = Path(folder_paths.get_full_path_or_raise('loras', lora_name))
        stat = path.stat(); key = (str(path), stat.st_size, stat.st_mtime_ns)
        if key not in _digests:
            digest = hashlib.sha256()
            with path.open('rb') as stream:
                for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
                    digest.update(block)
            _digests[key] = digest.hexdigest()
        if _digests[key] != file_sha256:
            raise ValueError(lora_name + '：文件与提交时的版本不一致，请重新添加')
        if getattr(self, '_file_version', None) != file_sha256:
            self.loaded_lora = None
            self._file_version = file_sha256
        result_model, result_clip = super().load_lora(model, clip, lora_name, strength_model, strength_clip)
        if strength_model and not any(len(v) > len(model.patches.get(k, ())) for k, v in result_model.patches.items()):
            raise ValueError(lora_name + '：没有匹配到模型参数，请检查模型版本与 LoRA 架构')
        if strength_clip and clip is not None and not any(len(v) > len(clip.patcher.patches.get(k, ())) for k, v in result_clip.patcher.patches.items()):
            raise ValueError(lora_name + '：没有匹配到文本编码器参数')
        return result_model, result_clip


class GenerationLoraLoaderModelOnly(GenerationLoraLoader):
    @classmethod
    def INPUT_TYPES(cls):
        inputs = super().INPUT_TYPES()
        inputs['required'].pop('clip')
        inputs['required'].pop('strength_clip')
        return inputs

    RETURN_TYPES = ('MODEL',)

    def load_lora(self, model, lora_name, strength_model, file_sha256):
        return (super().load_lora(model, None, lora_name, strength_model, 0, file_sha256)[0],)


NODE_CLASS_MAPPINGS = {'WebUIGenerationLoraLoader': GenerationLoraLoader,
                       'WebUIGenerationLoraLoaderModelOnly': GenerationLoraLoaderModelOnly}
NODE_DISPLAY_NAME_MAPPINGS = {'WebUIGenerationLoraLoader': 'Generation LoRA (validated)',
                              'WebUIGenerationLoraLoaderModelOnly': 'Generation LoRA (model only, validated)'}
