"""Windows Explorer file selection without command-line path quoting."""
import ctypes
from pathlib import Path


def reveal_file(path):
    path = Path(path).resolve()
    if not path.is_file():
        raise ValueError('文件不存在')
    shell = ctypes.WinDLL('shell32')
    ole = ctypes.WinDLL('ole32')
    ole.CoInitializeEx.argtypes = [ctypes.c_void_p, ctypes.c_uint]
    ole.CoInitializeEx.restype = ctypes.c_long
    ole.CoUninitialize.argtypes = []
    ole.CoUninitialize.restype = None
    shell.ILCreateFromPathW.argtypes = [ctypes.c_wchar_p]
    shell.ILCreateFromPathW.restype = ctypes.c_void_p
    shell.ILFree.argtypes = [ctypes.c_void_p]
    shell.ILFree.restype = None
    shell.SHOpenFolderAndSelectItems.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_void_p, ctypes.c_uint]
    shell.SHOpenFolderAndSelectItems.restype = ctypes.c_long
    initialized = ole.CoInitializeEx(None, 2)
    # An existing apartment is usable; only balance COM initialization we own.
    if initialized < 0 and initialized != -2147417850:  # RPC_E_CHANGED_MODE
        raise ValueError(f'无法连接资源管理器（0x{initialized & 0xffffffff:08X}）')
    item = None
    try:
        item = shell.ILCreateFromPathW(str(path))
        if not item:
            raise ValueError('无法定位文件，请刷新后重试')
        result = shell.SHOpenFolderAndSelectItems(item, 0, None, 0)
        if result < 0:
            raise ValueError(f'打开所在文件夹失败（0x{result & 0xffffffff:08X}）')
    finally:
        if item:
            shell.ILFree(item)
        if initialized >= 0:
            ole.CoUninitialize()
