import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
import windows_shell


class RevealTests(unittest.TestCase):
    def test_native_selection_and_cleanup(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / '中文 image.png'
            path.touch()
            for status in (0, -2147024891):
                shell, ole = Mock(), Mock()
                ole.CoInitializeEx.return_value = 0
                shell.ILCreateFromPathW.return_value = 0x123456789
                shell.SHOpenFolderAndSelectItems.return_value = status
                with patch.object(windows_shell.ctypes, 'WinDLL', side_effect=[shell, ole], create=True):
                    if status < 0:
                        with self.assertRaisesRegex(ValueError, '80070005'):
                            windows_shell.reveal_file(path)
                    else:
                        windows_shell.reveal_file(path)
                shell.ILCreateFromPathW.assert_called_once_with(str(path.resolve()))
                shell.SHOpenFolderAndSelectItems.assert_called_once_with(0x123456789, 0, None, 0)
                shell.ILFree.assert_called_once_with(0x123456789)
                ole.CoUninitialize.assert_called_once_with()

    def test_missing_file_does_not_open_explorer(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch.object(windows_shell.ctypes, 'WinDLL', create=True) as loader:
                with self.assertRaisesRegex(ValueError, '文件不存在'):
                    windows_shell.reveal_file(Path(folder) / 'missing.png')
                loader.assert_not_called()
