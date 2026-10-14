// Hidden PowerShell startup must not leave the native picker behind the browser.
// Activate the actual shell dialog after it has been created, not just its owner.
export const nativeDialogFocusScript=`Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
public sealed class PaneDialogFocus : IDisposable {
 [StructLayout(LayoutKind.Sequential)] struct Rect { public int Left,Top,Right,Bottom; }
 [StructLayout(LayoutKind.Sequential)] struct MonitorInfo { public int Size; public Rect Monitor,Work; public uint Flags; }
 delegate bool WindowCallback(IntPtr window, IntPtr parameter);
 [DllImport("user32.dll")] static extern bool EnumWindows(WindowCallback callback, IntPtr parameter);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr window, StringBuilder text, int size);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
 [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
 [DllImport("user32.dll")] static extern bool AttachThreadInput(uint from, uint to, bool attach);
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window, out Rect rectangle);
 [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr window, uint flags);
 [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);
 [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
 readonly uint process=(uint)Process.GetCurrentProcess().Id;
 readonly string title;
 readonly IntPtr monitor=MonitorFromWindow(GetForegroundWindow(),2);
 bool centered;
 Timer timer;
 int attempts;
 public PaneDialogFocus(string title) { this.title=title; timer=new Timer(Activate,null,200,200); }
 void Activate(object state) {
  if(Interlocked.Increment(ref attempts)>50) { Dispose(); return; }
  EnumWindows(delegate(IntPtr window, IntPtr unused) {
   uint owner; GetWindowThreadProcessId(window,out owner);
   if(owner!=process || !IsWindowVisible(window)) return true;
   var text=new StringBuilder(256); GetWindowText(window,text,text.Capacity);
   if(text.ToString()!=title) return true;
   uint ignored; uint foregroundThread=GetWindowThreadProcessId(GetForegroundWindow(),out ignored);
   uint currentThread=GetCurrentThreadId();
   bool attached=foregroundThread!=0 && foregroundThread!=currentThread && AttachThreadInput(currentThread,foregroundThread,true);
   try {
    var info=new MonitorInfo(); info.Size=Marshal.SizeOf(typeof(MonitorInfo)); Rect rectangle;
    if(!centered && GetMonitorInfo(monitor,ref info) && GetWindowRect(window,out rectangle)) {
     int width=rectangle.Right-rectangle.Left, height=rectangle.Bottom-rectangle.Top;
     int x=info.Work.Left+Math.Max(0,(info.Work.Right-info.Work.Left-width)/2);
     int y=info.Work.Top+Math.Max(0,(info.Work.Bottom-info.Work.Top-height)/2);
     centered=SetWindowPos(window,new IntPtr(-1),x,y,0,0,0x0001|0x0040);
    } else SetWindowPos(window,new IntPtr(-1),0,0,0,0,0x0001|0x0002|0x0040);
    SetForegroundWindow(window);
    if(GetForegroundWindow()==window) Dispose();
   } finally { if(attached) AttachThreadInput(currentThread,foregroundThread,false); }
   return false;
  },IntPtr.Zero);
 }
 public void Dispose() { var value=Interlocked.Exchange(ref timer,null); if(value!=null) value.Dispose(); }
}
'@`;
