# Windows' own speech recognizer (SAPI dictation through System.Speech) as a line protocol,
# started by src/asr/system-recognizer.ts. Arguments come in environment variables:
# PET_ASR_LANGUAGE (ISO 639-1 or 'auto'), PET_ASR_CULTURE (the recognizer to prefer, such as zh-TW;
# empty prefers the Windows display language's) and PET_ASR_TIMEOUT_MS.
#
# Sentences are streamed: audio goes in while the person speaks and the text so far comes
# back as it grows, so the pet can show it before the sentence ends.
#
# stdin, one command per line; end of input ends the process:
#   B <id>        a sentence begins
#   A <base64>    16 kHz mono PCM16 of the current sentence
#   E             the current sentence ends
# stdout, one JSON line each, non-ASCII escaped so the console code page cannot garble it:
#   {"ready":true,"culture":"zh-CN","name":"..."} once, or {"fatal":"..."} and exit
#   (`system-speech`: System.Speech would not load; `no-recognizer`: none for the language);
#   {"id":1,"partial":"..."} while the sentence is heard, the whole text so far;
#   {"id":1,"text":"..."} or {"id":1,"error":"..."} once it has ended.
$ErrorActionPreference = 'Stop'
# module loading would otherwise write progress records to stderr
$ProgressPreference = 'SilentlyContinue'
try {
  Add-Type -AssemblyName System.Speech
  Add-Type -ReferencedAssemblies System.Speech -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Threading;
using System.Speech.AudioFormat;
using System.Speech.Recognition;

/**
 * One sentence of audio as the recognizer reads it. SAPI takes a read that returns fewer bytes
 * than asked for as the end of the stream, so a read waits until the whole request has
 * arrived; only after `End` does it return what is left, then nothing.
 */
public class PetFeed : Stream {
  readonly Queue<byte[]> queue = new Queue<byte[]>();
  byte[] cur; int at; int avail; bool ended;

  public void Add(byte[] b) { lock (queue) { queue.Enqueue(b); avail += b.Length; Monitor.PulseAll(queue); } }
  public void End() { lock (queue) { ended = true; Monitor.PulseAll(queue); } }

  public override int Read(byte[] buf, int off, int n) {
    if (n == 0) return 0;
    lock (queue) {
      while (!ended && avail < n) Monitor.Wait(queue);
      int got = 0;
      while (got < n) {
        if (cur == null || at >= cur.Length) { if (queue.Count == 0) break; cur = queue.Dequeue(); at = 0; }
        int k = Math.Min(n - got, cur.Length - at);
        Array.Copy(cur, at, buf, off + got, k);
        at += k; got += k; avail -= k;
      }
      return got;
    }
  }
  public override bool CanRead { get { return true; } }
  public override bool CanSeek { get { return false; } }
  public override bool CanWrite { get { return false; } }
  // SAPI reads nothing from a stream that says it is empty
  public override long Length { get { return int.MaxValue; } }
  public override long Position { get { return 0; } set { } }
  public override void Flush() { }
  public override long Seek(long o, SeekOrigin s) { return 0; }
  public override void SetLength(long v) { }
  public override void Write(byte[] b, int o, int c) { }
}

public static class PetSapi {
  static SpeechRecognitionEngine engine;
  static readonly object outLock = new object();
  static readonly SpeechAudioFormatInfo format = new SpeechAudioFormatInfo(16000, AudioBitsPerSample.Sixteen, AudioChannel.Mono);
  static PetFeed feed;
  static string id = "";
  /** Phrases the recognizer has settled on in the current sentence. */
  static readonly StringBuilder settled = new StringBuilder();
  static readonly ManualResetEvent idle = new ManualResetEvent(true);
  static Timer overdue;
  static bool timedOut;

  public static string Json(string key, string value) {
    var sb = new StringBuilder("\"" + key + "\":\"");
    foreach (char c in value ?? "") {
      if (c == '"' || c == '\\') sb.Append('\\').Append(c);
      else if (c < 32 || c > 126) sb.AppendFormat("\\u{0:x4}", (int)c);
      else sb.Append(c);
    }
    return sb.Append('"').ToString();
  }

  static void Emit(string line) { lock (outLock) { Console.Out.WriteLine(line); Console.Out.Flush(); } }

  /** The installed recognizer for `language`, preferring the one of `culture`, else the one matching the Windows display language. */
  public static string Open(string language, string culture) {
    RecognizerInfo pick = null;
    var prefer = string.IsNullOrEmpty(culture) ? CultureInfo.CurrentUICulture.Name : culture;
    foreach (var r in SpeechRecognitionEngine.InstalledRecognizers()) {
      bool fits = language == "auto" || string.Equals(r.Culture.TwoLetterISOLanguageName, language, StringComparison.OrdinalIgnoreCase);
      if (!fits) continue;
      if (pick == null || string.Equals(r.Culture.Name, prefer, StringComparison.OrdinalIgnoreCase)) pick = r;
    }
    if (pick == null) return null;
    engine = new SpeechRecognitionEngine(pick);
    engine.LoadGrammar(new DictationGrammar());
    engine.SpeechHypothesized += (s, e) => {
      lock (settled) Emit("{\"id\":" + id + "," + Json("partial", settled + e.Result.Text) + "}");
    };
    engine.SpeechRecognized += (s, e) => {
      lock (settled) { settled.Append(e.Result.Text); Emit("{\"id\":" + id + "," + Json("partial", settled.ToString()) + "}"); }
    };
    engine.RecognizeCompleted += (s, e) => {
      if (overdue != null) overdue.Dispose();
      overdue = null;
      lock (settled) {
        if (timedOut) Emit("{\"id\":" + id + "," + Json("error", "timeout") + "}");
        else if (e.Error != null) Emit("{\"id\":" + id + "," + Json("error", e.Error.Message) + "}");
        else Emit("{\"id\":" + id + "," + Json("text", settled.ToString()) + "}");
      }
      idle.Set();
    };
    return "{\"ready\":true," + Json("culture", pick.Culture.Name) + "," + Json("name", pick.Description) + "}";
  }

  /** Reads commands until the input ends. */
  public static void Serve(int timeoutMs) {
    string line;
    while ((line = Console.In.ReadLine()) != null) {
      if (line.Length == 0) continue;
      try {
        if (line[0] == 'A' && feed != null) feed.Add(Convert.FromBase64String(line.Substring(2)));
        else if (line[0] == 'B') Begin(line.Substring(2).Trim(), timeoutMs);
        else if (line[0] == 'E' && feed != null) End(timeoutMs);
      } catch (Exception err) {
        Emit("{\"id\":" + (id == "" ? "0" : id) + "," + Json("error", err.Message) + "}");
      }
    }
  }

  static void Begin(string next, int timeoutMs) {
    // the sentence before may still be finishing its last phrase
    if (!idle.WaitOne(timeoutMs)) { engine.RecognizeAsyncCancel(); idle.WaitOne(2000); }
    lock (settled) { settled.Clear(); id = next; timedOut = false; }
    feed = new PetFeed();
    engine.SetInputToAudioStream(feed, format);
    idle.Reset();
    engine.RecognizeAsync(RecognizeMode.Multiple);
  }

  static void End(int timeoutMs) {
    feed.End();
    feed = null;
    overdue = new Timer((_) => { timedOut = true; engine.RecognizeAsyncCancel(); }, null, timeoutMs, Timeout.Infinite);
  }
}
'@
} catch {
  # PetSapi may not exist here, so the reason is only a code
  [Console]::Out.WriteLine('{"fatal":"system-speech"}')
  exit 1
}

$language = if ($env:PET_ASR_LANGUAGE) { $env:PET_ASR_LANGUAGE } else { 'auto' }
$culture = if ($env:PET_ASR_CULTURE) { $env:PET_ASR_CULTURE } else { '' }
$timeout = if ($env:PET_ASR_TIMEOUT_MS) { [int]$env:PET_ASR_TIMEOUT_MS } else { 20000 }
$ready = $null
try { $ready = [PetSapi]::Open($language, $culture) } catch { $ready = '{' + [PetSapi]::Json('fatal', $_.Exception.Message) + '}' }
if (-not $ready) { $ready = '{"fatal":"no-recognizer"}' }
[Console]::Out.WriteLine($ready)
[Console]::Out.Flush()
if ($ready -notlike '{"ready"*') { exit 1 }
[PetSapi]::Serve($timeout)
