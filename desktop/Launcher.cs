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
        string launcher = Path.Combine(root, "start_desktop.bat");
        bool check = args.Length == 1 && args[0] == "--check";
        try
        {
            if (!File.Exists(launcher) || !File.Exists(Path.Combine(root, "Start-Lumina.ps1")))
                throw new FileNotFoundException("Extract the entire LuminaUI folder before starting.");
            if (check) return 0;
            var start = new ProcessStartInfo(launcher);
            start.WorkingDirectory = root;
            start.UseShellExecute = true;
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
