using System;
using System.IO;
class FileLock {
  static int Main(string[] args) {
    using (var file = new FileStream(args[0], FileMode.Open, FileAccess.ReadWrite, FileShare.None)) {
      Console.WriteLine("LOCKED");
      Console.Out.Flush();
      Console.ReadLine();
    }
    return 0;
  }
}
