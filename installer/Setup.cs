using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

internal static class Setup
{
    [STAThread]
    private static int Main()
    {
        string folder = Path.Combine(Path.GetTempPath(), "LuminaUI-" + Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(folder);
            foreach (string name in new[] { "app.zip", "install.ps1" })
                using (Stream input = Assembly.GetExecutingAssembly().GetManifestResourceStream(name))
                using (FileStream output = File.Create(Path.Combine(folder, name)))
                    input.CopyTo(output);
            string shell = Path.Combine(Environment.SystemDirectory, @"WindowsPowerShell\v1.0\powershell.exe");
            var start = new ProcessStartInfo(shell, "-NoProfile -STA -ExecutionPolicy Bypass -File \"" +
                                             Path.Combine(folder, "install.ps1") + "\"");
            start.WorkingDirectory = folder;
            start.UseShellExecute = false;
            using (Process install = Process.Start(start))
            {
                install.WaitForExit();
                if (install.ExitCode != 0)
                    throw new IOException("Installation failed. Check the selected folder is writable and try again.");
            }
            return 0;
        }
        catch (Exception error)
        {
            MessageBox.Show(error.Message, "LuminaUI Setup");
            return 1;
        }
        finally
        {
            foreach (string name in new[] { "app.zip", "install.ps1" })
                File.Delete(Path.Combine(folder, name));
            if (Directory.Exists(folder))
                Directory.Delete(folder);
        }
    }
}
