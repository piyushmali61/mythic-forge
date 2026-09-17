// Launcher for games exported from Mythic Forge for Windows.
//
// Opens game.html (next to the exe) in a Microsoft Edge app window, or in the default browser
// when Edge isn't installed, then exits. It starts no server and reads nothing but its own
// folder. launcher.txt (key=value lines, written by the editor) supplies the window size.
//
// Built by tools/desktop/build-game-launcher.py with the C# 5 compiler that ships with the
// .NET Framework 4, so it needs no SDK to build and no runtime to install.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Windows.Forms;

namespace MythicForgeGame
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            string dir = AppDomain.CurrentDomain.BaseDirectory;
            Dictionary<string, string> config = ReadConfig(Path.Combine(dir, "launcher.txt"));
            string title = Get(config, "title", Path.GetFileNameWithoutExtension(Application.ExecutablePath));
            string html = Path.Combine(dir, "game.html");
            if (!File.Exists(html))
            {
                MessageBox.Show("game.html is missing.\nExtract the whole folder before starting the game.", title, MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
            // AbsoluteUri percent-encodes spaces and quotes, so it is safe inside the quoted argument.
            string url = new Uri(html).AbsoluteUri;
            string edge = FindEdge();
            try
            {
                if (edge == null)
                {
                    Process.Start(new ProcessStartInfo(html) { UseShellExecute = true });
                    return;
                }
                int width = Clamp(GetInt(config, "width", 1280), 320, 7680);
                int height = Clamp(GetInt(config, "height", 720), 240, 4320);
                var psi = new ProcessStartInfo(edge, string.Format("--app=\"{0}\" --window-size={1},{2}", url, width, height));
                psi.UseShellExecute = false;
                Process.Start(psi);
            }
            catch (Exception ex)
            {
                MessageBox.Show("The game could not be started: " + ex.Message, title, MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        static string FindEdge()
        {
            string[] roots = {
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            };
            foreach (string root in roots)
            {
                if (string.IsNullOrEmpty(root)) continue;
                string path = Path.Combine(root, "Microsoft", "Edge", "Application", "msedge.exe");
                if (File.Exists(path)) return path;
            }
            return null;
        }

        static Dictionary<string, string> ReadConfig(string path)
        {
            var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (!File.Exists(path) || new FileInfo(path).Length > 16 * 1024) return values;
            foreach (string line in File.ReadAllLines(path, Encoding.UTF8))
            {
                int eq = line.IndexOf('=');
                if (eq <= 0) continue;
                values[line.Substring(0, eq).Trim()] = line.Substring(eq + 1).Trim();
            }
            return values;
        }

        static string Get(Dictionary<string, string> config, string key, string fallback)
        {
            string value;
            return config.TryGetValue(key, out value) && value.Length > 0 ? value : fallback;
        }

        static int GetInt(Dictionary<string, string> config, string key, int fallback)
        {
            int value;
            return int.TryParse(Get(config, key, ""), out value) ? value : fallback;
        }

        static int Clamp(int value, int min, int max)
        {
            return Math.Max(min, Math.Min(max, value));
        }
    }
}
