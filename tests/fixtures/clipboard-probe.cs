using System;
using System.Diagnostics;
using System.Windows.Forms;
class ClipboardProbe {
 [STAThread] static int Main(string[] args) {
  string marker = args.Length > 1 ? args[1] : "DevKit native clipboard probe 2026";
  try {
   if (args.Length > 0 && args[0] == "image") {
    bool present = Clipboard.ContainsImage();
    using (var image = present ? Clipboard.GetImage() : null) {
     Console.WriteLine("{\"image\":" + present.ToString().ToLower() + ",\"width\":" + (image == null ? 0 : image.Width) + ",\"height\":" + (image == null ? 0 : image.Height) + "}");
    }
    return 0;
   }
   if (args.Length == 0 || args[0] == "roundtrip" || args[0] == "write") Clipboard.SetText(marker);
   bool match = Clipboard.GetText() == marker;
   Console.WriteLine("{\"sessionId\":" + Process.GetCurrentProcess().SessionId + ",\"interactive\":" + Environment.UserInteractive.ToString().ToLower() + ",\"textAvailable\":" + Clipboard.ContainsText().ToString().ToLower() + ",\"matches\":" + match.ToString().ToLower() + ",\"screens\":" + Screen.AllScreens.Length + "}");
   return 0;
  } catch (Exception e) { Console.WriteLine("{\"error\":\"" + e.GetType().Name + "\"}"); return 1; }
 }
}
