using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("LuminaUI")]
[assembly: AssemblyDescription("LuminaUI desktop launcher")]
[assembly: AssemblyProduct("LuminaUI")]
[assembly: AssemblyVersion("1.0.0.0")]

internal static class Launcher
{
    [STAThread]
    private static int Main(string[] args)
    {
        string root = AppDomain.CurrentDomain.BaseDirectory;
        string desktop = Path.Combine(root, "desktop");
        string electron = Path.Combine(desktop, "node_modules", "electron", "dist", "electron.exe");
        bool check = args.Length == 1 && args[0] == "--check";
        try
        {
            if (!File.Exists(electron) || !File.Exists(Path.Combine(desktop, "entry.cjs")))
                throw new FileNotFoundException("找不到桌面程序。请将 LuminaUI.exe 保留在 Comfy UI 文件夹中，与 desktop 文件夹放在一起。");
            if (!File.Exists(Path.Combine(root, ".venv", "Scripts", "python.exe")))
                throw new FileNotFoundException("找不到本地 Python 环境，请检查 .venv 文件夹。");
            if (check) return 0;
            var start = new ProcessStartInfo(electron, "\"" + desktop + "\"");
            start.WorkingDirectory = desktop;
            // Launch as a normal desktop application, without hidden-window flags.
            Environment.SetEnvironmentVariable("ELECTRON_RUN_AS_NODE", null);
            start.UseShellExecute = true;
            start.WindowStyle = ProcessWindowStyle.Normal;
            using (Process process = Process.Start(start)) { }
            return 0;
        }
        catch (Exception error)
        {
            if (!check) MessageBox.Show(error.Message, "LuminaUI 启动失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}
