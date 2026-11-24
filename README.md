# LuminaUI · Qwen-Image-2.1

**Windows 本地图像工作台 · A local image studio for Windows**

输入画面描述，在自己的 NVIDIA GPU 上生成图片。首次打开时，LuminaUI 会准备 ComfyUI、Python、PyTorch 和 Qwen 工作流需要的三个模型文件。

Generate images on your NVIDIA GPU. On first launch, LuminaUI prepares its own Python and ComfyUI runtime and downloads the three weights used by the bundled graph.

![Qwen-Image-2.1 本地工作台 · The Qwen workbench connected to its local inference engine](docs/images/index.png)

## 安装与第一张图 · First image

1. 运行 **LuminaUI-Qwen21-Setup.exe**，选择有约 **40 GB** 可用空间的安装盘。安装完成后会建立桌面快捷方式并启动。使用源码 ZIP 时，解压到可写目录，双击 **start_desktop.bat**。Run the installer and choose a drive with about 40 GB free, or extract the source ZIP and double-click the launcher.
2. 首次启动会介绍工作台功能与本地接口。第四页点击「下载并安装」，保持窗口打开直至校验完成。运行包约 2.1 GB，三个权重合计约 17.3 GB。中断后重新打开以续传。On the fourth screen, download the local resources. The first run downloads about 19.4 GB and verifies the files against their pinned SHA-256 digests.
3. 资源就绪后点击「个性化设置」，选择外观并进入首页。点击「开始创作」打开工作台，输入描述即可生成图像。作品保存到安装目录下的 `ComfyUI/output`。Choose your appearance on the fifth screen, enter Home and select Start creating. Enter a prompt to generate an image on your PC.
4. 以后从桌面快捷方式打开。完整且已验证的文件会复用。关闭运行窗口可结束这次本地服务。Verified files are reused on subsequent launches; keep the launcher window open during generation.

**支持环境 · Supported environment**　64-bit Windows 10/11, NVIDIA GPU with a driver compatible with the bundled CUDA build, Windows PowerShell, curl.exe and tar.exe. 首次启动会检查 CUDA。运行日志在 `webui/data/comfyui.log`。The web studio listens on loopback port 18290 and its isolated engine on 18288.

## 模型与工作流 · Model and workflow

本版使用 Qwen 官方基础模型的 Comfy-Org 打包版本。主模型与文本编码器采用 INT8，VAE 采用 BF16。模型适用上游 Qwen Research License。The download is Comfy-Org's repackaging of the original Qwen model. The included text-to-image graph uses the base model without a Turbo LoRA. [Qwen model card](https://huggingface.co/Qwen/Qwen-Image-2.1) · [Comfy-Org files](https://huggingface.co/Comfy-Org/Qwen-Image-2.1) · [校验清单 / Digests](workflows/qwen21_model_manifest.json) · [内置工作流 / Bundled graph](workflows/presets/01_text_to_image_api.json)

## 开发与打包 · Development

在 Windows 的 Git 工作副本中运行 `python installer/build.py`，安装包生成于 `.runtime/dist/LuminaUI-Qwen21-Setup.exe`。仅准备依赖可运行 `powershell -ExecutionPolicy Bypass -File Start-Lumina.ps1 -PrepareOnly`。The installer build uses the Windows .NET Framework C# compiler. The package contains the studio and workflow definitions; model weights are fetched directly at first use.
