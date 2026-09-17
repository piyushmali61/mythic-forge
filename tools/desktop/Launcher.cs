// Mythic Forge portable Windows launcher.
//
// Serves the editor build (the "app" folder next to the exe) on 127.0.0.1 and opens it in a
// Microsoft Edge app window with its own profile. Written for the C# 5 compiler that ships with
// the .NET Framework 4 (csc.exe), so the launcher needs no SDK to build and no runtime to install.
//
// Projects live in the browser storage of the page's origin, and an origin includes the port.
// The launcher therefore always uses the same port: a random port would hide every saved
// project on the next launch.
//
// Usage: MythicForge.exe [--no-browser]   (--no-browser only serves; used by tests)

using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace MythicForgeLauncher
{
    static class Program
    {
        const string Title = "Mythic Forge — Mythic Bharat Studios";
        // Fixed, in the dynamic range. Fallbacks are tried in order so the choice stays stable.
        static readonly int[] Ports = { 47831, 47832, 47833, 47834, 47835 };
        const string ProbePath = "/__mythic-forge-launcher";
        const string ProbeReply = "mythic-forge-launcher/1";

        [STAThread]
        static void Main(string[] args)
        {
            bool noBrowser = Array.IndexOf(args, "--no-browser") >= 0;
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string appDir = Path.GetFullPath(Path.Combine(baseDir, "app"));
            if (!File.Exists(Path.Combine(appDir, "index.html")))
            {
                Fail("The \"app\" folder with the Mythic Forge files is missing.\nExtract the whole download before starting MythicForge.exe.");
                return;
            }

            HttpListener listener = null;
            int port = 0;
            foreach (int candidate in Ports)
            {
                if (IsOurServer(candidate))
                {
                    // Another launcher is already serving: just open one more window on it.
                    if (!noBrowser) OpenWindow(Url(candidate), false);
                    return;
                }
                listener = TryListen(candidate);
                if (listener != null)
                {
                    port = candidate;
                    break;
                }
            }
            if (listener == null)
            {
                Fail("Could not start Mythic Forge: ports " + Ports[0] + "–" + Ports[Ports.Length - 1] + " are all in use by other programs.");
                return;
            }
            if (port != Ports[0] && !noBrowser)
            {
                MessageBox.Show(
                    "Port " + Ports[0] + " is used by another program, so Mythic Forge is using port " + port + ".\n\n" +
                    "Projects are stored per port: projects saved while another port was in use will not be listed until that port is used again.",
                    Title, MessageBoxButtons.OK, MessageBoxIcon.Information);
            }

            var server = new Thread(() => Serve(listener, appDir, port));
            server.IsBackground = true;
            server.Start();

            try
            {
                if (noBrowser) Thread.Sleep(Timeout.Infinite);
                else OpenWindow(Url(port), true);
            }
            finally
            {
                try { listener.Close(); } catch { }
            }
        }

        static string Url(int port)
        {
            return "http://127.0.0.1:" + port + "/";
        }

        static HttpListener TryListen(int port)
        {
            var listener = new HttpListener();
            listener.Prefixes.Add(Url(port));
            try
            {
                listener.Start();
                return listener;
            }
            catch (HttpListenerException)
            {
                listener.Close();
                return null;
            }
        }

        static bool IsOurServer(int port)
        {
            try
            {
                var request = (HttpWebRequest)WebRequest.Create(Url(port) + ProbePath.TrimStart('/'));
                request.Timeout = 1500;
                request.Proxy = null;
                using (var response = (HttpWebResponse)request.GetResponse())
                using (var reader = new StreamReader(response.GetResponseStream()))
                {
                    return reader.ReadToEnd() == ProbeReply;
                }
            }
            catch (Exception)
            {
                return false;
            }
        }

        /// Opens the editor. When `wait` is set, returns only after the window's browser process exits.
        static void OpenWindow(string url, bool wait)
        {
            string edge = FindEdge();
            if (edge == null)
            {
                // No Edge: use the default browser and keep serving until the user stops it.
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
                if (wait)
                {
                    MessageBox.Show("Mythic Forge is running at " + url + "\n\nKeep this message open while you work. Click OK to stop Mythic Forge.",
                        Title, MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                return;
            }
            string profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MythicBharatStudios", "MythicForge", "EdgeProfile");
            Directory.CreateDirectory(profile);
            var psi = new ProcessStartInfo(edge, string.Format(
                "--app=\"{0}\" --user-data-dir=\"{1}\" --no-first-run --window-size=1366,800 --disable-features=Translate", url, profile));
            psi.UseShellExecute = false;
            Process browser;
            try
            {
                browser = Process.Start(psi);
            }
            catch (Exception ex)
            {
                Fail("Could not open Microsoft Edge: " + ex.Message);
                return;
            }
            if (!wait) return;
            if (browser != null) browser.WaitForExit();
            // If Edge was already running with this profile, the process above only handed the
            // window over and exited. Chromium holds "lockfile" in the profile while it runs.
            string lockFile = Path.Combine(profile, "lockfile");
            while (File.Exists(lockFile)) Thread.Sleep(2000);
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

        static void Serve(HttpListener listener, string root, int port)
        {
            while (listener.IsListening)
            {
                HttpListenerContext ctx;
                try
                {
                    ctx = listener.GetContext();
                }
                catch (Exception)
                {
                    return;
                }
                ThreadPool.QueueUserWorkItem(state => Handle((HttpListenerContext)state, root, port), ctx);
            }
        }

        static void Handle(HttpListenerContext ctx, string root, int port)
        {
            var res = ctx.Response;
            try
            {
                res.Headers["X-Content-Type-Options"] = "nosniff";
                res.Headers["Referrer-Policy"] = "no-referrer";
                // Only this machine's own addresses: blocks DNS-rebinding pages from reading the app.
                string host = ctx.Request.Headers["Host"];
                if (host != "127.0.0.1:" + port && host != "localhost:" + port)
                {
                    res.StatusCode = 421;
                    return;
                }
                string method = ctx.Request.HttpMethod;
                if (method != "GET" && method != "HEAD")
                {
                    res.StatusCode = 405;
                    return;
                }
                string path = ctx.Request.Url.AbsolutePath;
                if (path == ProbePath)
                {
                    Write(res, Encoding.ASCII.GetBytes(ProbeReply), "text/plain", method);
                    return;
                }
                string file = Resolve(root, path);
                if (file == null)
                {
                    res.StatusCode = 404;
                    return;
                }
                res.Headers["Cache-Control"] = "no-cache";
                Write(res, File.ReadAllBytes(file), MimeType(file), method);
            }
            catch (Exception)
            {
                try { res.StatusCode = 500; } catch { }
            }
            finally
            {
                try { res.Close(); } catch { }
            }
        }

        /// Maps a URL path to a file inside `root`, or null. Never leaves `root`.
        static string Resolve(string root, string urlPath)
        {
            string relative;
            try
            {
                relative = Uri.UnescapeDataString(urlPath).TrimStart('/');
            }
            catch (UriFormatException)
            {
                return null;
            }
            if (relative.Length == 0) relative = "index.html";
            foreach (string segment in relative.Split('/'))
            {
                if (segment.Length == 0 || segment == "." || segment == ".." ||
                    segment.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 || segment.IndexOf(':') >= 0)
                {
                    return null;
                }
            }
            string full = Path.GetFullPath(Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar)));
            string prefix = root.EndsWith(Path.DirectorySeparatorChar.ToString()) ? root : root + Path.DirectorySeparatorChar;
            if (!full.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return null;
            return File.Exists(full) ? full : null;
        }

        static void Write(HttpListenerResponse res, byte[] bytes, string type, string method)
        {
            res.StatusCode = 200;
            res.ContentType = type;
            res.ContentLength64 = bytes.Length;
            if (method == "GET") res.OutputStream.Write(bytes, 0, bytes.Length);
        }

        static string MimeType(string path)
        {
            switch (Path.GetExtension(path).ToLowerInvariant())
            {
                case ".html": return "text/html; charset=utf-8";
                case ".js": case ".mjs": return "text/javascript; charset=utf-8";
                case ".css": return "text/css; charset=utf-8";
                case ".json": return "application/json; charset=utf-8";
                case ".md": case ".txt": return "text/plain; charset=utf-8";
                case ".webmanifest": return "application/manifest+json";
                case ".svg": return "image/svg+xml";
                case ".png": return "image/png";
                case ".jpg": case ".jpeg": return "image/jpeg";
                case ".webp": return "image/webp";
                case ".ico": return "image/x-icon";
                case ".wasm": return "application/wasm";
                case ".glb": return "model/gltf-binary";
                case ".gltf": return "model/gltf+json";
                case ".ogg": return "audio/ogg";
                case ".mp3": return "audio/mpeg";
                case ".wav": return "audio/wav";
                default: return "application/octet-stream";
            }
        }

        static void Fail(string message)
        {
            MessageBox.Show(message, Title, MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
