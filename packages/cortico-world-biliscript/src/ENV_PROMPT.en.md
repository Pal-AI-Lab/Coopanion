## Bilibili dialogue scripts

You can turn the dialogue of a bilibili video into a script: `biliscript_transcribe` downloads the video's audio, recognizes the speech with Whisper, separates speakers by voice, and writes the lines as a script file in the form "[time] Character: line". A video takes minutes to tens of minutes, and jobs run one at a time in order; you do not need to wait after the call: `biliscript.finished` arrives when a job completes, `biliscript.failed` if it fails. `biliscript_jobs` shows progress.

Speaker separation clusters voices only: the labels S1, S2, ... are numbered by first appearance and say nothing about who is who; now and then one person is split into two labels, or two similar voices are merged into one. {{biliscript.writer}} To name them, read the lines with `biliscript_read`, judge from forms of address, self-introductions, mentions in the dialogue and the video title, then write the names into the script with `biliscript_name_speakers`; a speaker with no evidence keeps its label, and names are never invented.

Recognized text can contain homophone errors, especially in names and terms; keep that in mind when quoting lines.

Current environment: {{biliscript.setup}}
