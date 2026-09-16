using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

namespace MythicForgeLauncher
{
    class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string appDir = Path.Combine(baseDir, "app");
            if (!Directory.Exists(appDir))
            {
                appDir = Path.Combine(baseDir, "..", "apps", "editor", "dist");
            }
            if (!Directory.Exists(appDir))
            {
                MessageBox.Show(
                    "Could not find the 'app' folder containing Mythic Forge application files.\nPlease ensure the folder is extracted completely.",
                    "Mythic Forge — Mythic Bharat Studios",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                return;
            }

            // Start lightweight local HTTP server for standard ES module & WebGL2 execution
            int port = 49152 + new Random().Next(1000);
            string prefix = "http://127.0.0.1:" + port + "/";
            HttpListener listener = new HttpListener();
            listener.Prefixes.Add(prefix);
            try
            {
                listener.Start();
            }
            catch (Exception ex)
            {
                MessageBox.Show("Failed to start local application runtime: " + ex.Message, "Mythic Forge", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            bool running = true;
            Thread serverThread = new Thread(() =>
            {
                while (running)
                {
                    try
                    {
                        HttpListenerContext ctx = listener.GetContext();
                        ThreadPool.QueueUserWorkItem((state) => HandleRequest((HttpListenerContext)state, appDir), ctx);
                    }
                    catch { break; }
                }
            });
            serverThread.IsBackground = true;
            serverThread.Start();

            // Locate Microsoft Edge or Chrome
            string edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe");
            if (!File.Exists(edgePath))
            {
                edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application", "msedge.exe");
            }

            string userDataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MythicBharatStudios", "MythicForgeUserData");
            try { Directory.CreateDirectory(userDataDir); } catch { }

            ProcessStartInfo psi;
            if (File.Exists(edgePath))
            {
                psi = new ProcessStartInfo(
                    edgePath,
                    string.Format("--app=\"{0}\" --user-data-dir=\"{1}\" --window-size=1366,768 --disable-features=Translate", prefix, userDataDir)
                );
                psi.UseShellExecute = false;
            }
            else
            {
                psi = new ProcessStartInfo(prefix);
                psi.UseShellExecute = true;
            }

            try
            {
                Process browser = Process.Start(psi);
                if (browser != null)
                {
                    browser.WaitForExit();
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Failed to launch Mythic Forge: " + ex.Message, "Mythic Forge", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                running = false;
                try { listener.Stop(); } catch { }
            }
        }

        static void HandleRequest(HttpListenerContext ctx, string rootDir)
        {
            try
            {
                string rawUrl = ctx.Request.Url.AbsolutePath;
                string urlPath = rawUrl.TrimStart('/');
                if (string.IsNullOrEmpty(urlPath)) urlPath = "index.html";
                string filePath = Path.Combine(rootDir, urlPath.Replace('/', Path.DirectorySeparatorChar));

                if (!File.Exists(filePath))
                {
                    // Fallback to index.html for SPA routing if needed
                    string fallback = Path.Combine(rootDir, "index.html");
                    if (File.Exists(fallback))
                    {
                        filePath = fallback;
                    }
                    else
                    {
                        ctx.Response.StatusCode = 404;
                        ctx.Response.Close();
                        return;
                    }
                }

                byte[] bytes = File.ReadAllBytes(filePath);
                ctx.Response.ContentType = GetMimeType(filePath);
                ctx.Response.ContentLength64 = bytes.Length;
                ctx.Response.AddHeader("Cache-Control", "no-cache");
                ctx.Response.OutputStream.Write(bytes, 0, bytes.Length);
                ctx.Response.OutputStream.Close();
            }
            catch
            {
                try { ctx.Response.Close(); } catch { }
            }
        }

        static string GetMimeType(string path)
        {
            string ext = Path.GetExtension(path).ToLowerInvariant();
            switch (ext)
            {
                case ".html": return "text/html; charset=utf-8";
                case ".js": return "application/javascript; charset=utf-8";
                case ".mjs": return "application/javascript; charset=utf-8";
                case ".css": return "text/css; charset=utf-8";
                case ".json": return "application/json; charset=utf-8";
                case ".webmanifest": return "application/manifest+json";
                case ".svg": return "image/svg+xml";
                case ".png": return "image/png";
                case ".jpg": case ".jpeg": return "image/jpeg";
                case ".webp": return "image/webp";
                case ".ico": return "image/x-icon";
                case ".wasm": return "application/wasm";
                case ".glb": return "model/gltf-binary";
                case ".gltf": return "model/gltf+json";
                case ".mfpack": case ".bin": return "application/octet-stream";
                default: return "application/octet-stream";
            }
        }
    }
}
