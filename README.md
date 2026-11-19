# Loopshifter for Max for Live

An Ableton Live **audio effect** that captures a tempo-synced buffer and plays a short loop
from it. After each pass the loop's window moves a little further through the buffer, and
the material stays on the beat.

![device](m4l/device-preview.png)

*(the display is drawn by the real display script from the real engine; the controls
beside it are a drawing of the layout)*

## The idea

Capture 16 beats, `ABCDEFGHIJKLMNOP`. Set **Loop** to 4 beats and **Shift** to 1 beat.
Loopshifter plays the loop plus the shift, then starts again one shift later:

```
ABCDE  BCDEF  CDEFG  DEFGH  EFGHI ...
```

Every pass lasts loop + shift, and the next one starts later by the same shift, so every
hit stays on its beat, whatever the shift is, even an odd number of milliseconds. Only the
place where it jumps moves around. That's where the stuttery edits come from.

**Backwards** starts on the last loop of the buffer and plays loop minus shift, then steps
back by the shift: `MNO  LMN  KLM ...`. That's the backwards version that stays on the beat.
Because it plays loop minus shift, the shift has to be shorter than the loop.

## Install

Put **Loopshifter.amxd**, **loopshifter_display.js** and **loopshifter_live.js** in the same folder (for example
`User Library/Presets/Audio Effects/Max Audio Effect/`) and drag Loopshifter.amxd onto an
audio track, a group or a return. `loopshifter_display.js` draws the display and `loopshifter_live.js` stops Live and
switches the clip off. To get one
file that carries everything, open the device in Max and press **Freeze Device**.

## Playing it

Put Loopshifter on the track that holds the clip you want to loop.

1. With Live stopped, press **ARM**. The button says **ARMED**.
2. Press Play in Live. Recording starts on the very first sample, wherever you start
   from. The button flashes **REC** and the display counts the beats in red.
3. When the buffer is full, the button says **COMPLETE**. With **auto stop** on (the
   default), Loopshifter stops Live and switches off the clip that was playing into it
   (the clip on this track: the playing Session clip, or the Arrangement clip under the part
   it recorded).
4. Press Play again. The loop plays in place of the clip.
5. Change **Loop**, **Shift** and the direction while it plays. Each change takes effect at
   the next jump. **Restart** goes back to the first window on the next bar line.
6. **Clear** empties the buffer, switches the clip back on, and turns the button back into
   **ARM**, ready for a new capture.

Pressing **ARMED** or **REC** cancels, back to **ARM**. Pressing **COMPLETE** does nothing:
press **Clear** first. If you press **ARM** while Live is already playing, recording waits
for the next bar line. With **auto stop** off, Live keeps playing and the loop starts as
soon as the buffer is full.

Before a capture, and after **At end: stop**, you hear the track as normal. When Live
stops, the buffer is kept, and the next time Live plays, the loop starts again from the
top.

## Controls

| Control | What it does |
|---|---|
| **ARM / ARMED / REC / COMPLETE** | Arms the capture and shows where it's at. Live stopped: recording starts when you press Play. Live playing: it starts on the next bar line. Press again while ARMED or REC to cancel. |
| **auto stop** | On: when the buffer is full, Live stops and the clip on this track is switched off, so the loop takes over at the next Play. Off: Live keeps going and the loop starts straight away. |
| **Clear** | Empties the buffer and switches back on any clip that auto stop switched off. |
| **Buffer** | How many beats to capture: 8, 16 or 32. |
| **Loop** | Loop length, from 1 to 16 beats. |
| **Shift: ms / beat** | Set the shift in milliseconds (a knob, 1 to 2000 ms) or as a fraction of a beat. |
| **1/32 ... 1** | Shift as a fraction of a beat: 1 = one beat, 1/4 = a sixteenth note, 1/32 = a very small nudge. |
| **fwd / back** | Which way the window moves through the buffer. |
| **Fade** | Crossfade at each jump, from 0 to 40 ms (20 ms by default). 0 gives hard, clicky edits. |
| **At end: wrap** | The window runs on past the end of the buffer and comes round to the start (`MNOPA`), still on the beat. |
| **At end: stop** | Once the next window would run past the end (or before the start, going back), the loop stops and you hear the track again. |
| **Restart** | Back to the first window, on the next bar line. |

Every control is a Live parameter, so Key Map (Cmd/Ctrl+K), MIDI Map (Cmd/Ctrl+M) and
automation all work. For example, automating **Restart** at the start of each section, or
the **Shift** fraction across a breakdown.

## Ideas for loop fatigue

- **Slow drift:** a 32-beat buffer with a 4-beat loop and a 1/16 shift. It takes a long time
  to get through the buffer, so the groove changes gradually over a whole section.
- **Off-grid edits:** set Shift to ms (try 37 ms or 113 ms). The hits stay on the beat,
  but the jump lands in odd places, which gives you Autechre-style stutters.
- **Build and release:** use **stop** with a 2-beat loop and a 1/2 shift. The window runs
  through the buffer and then hands back to the live track. Automate Restart to set it off
  again.
- **Back and forth:** automate fwd/back every 8 bars, and the window wanders around the
  middle of the buffer.

## Notes

- Assumes 4/4. The loop remembers where in the bar the capture started (normally the bar
  line), and Restart waits for that point, so the loop stays lined up with the bars.
- The buffer remembers the tempo it was captured at. If you change Live's tempo after
  capturing, capture again.
- The window, the play head and the beat it's on are shown in the display. The status
  line says when it's waiting for a bar.

## Files

- `m4l/loopshifter.genexpr`: the engine (it goes in the gen~ codebox)
- `m4l/loopshifter_display.js`: the display ([jsui])
- `m4l/build_device.py`: writes `m4l/dist/Loopshifter.amxd` (and a `.maxpat` copy to read in Max)
- `m4l/test/gen_test.js`: turns the GenExpr into JavaScript and checks the playback order
  (ABCDE BCDEF..., ms shifts, backwards, wrap, stop, restart, transport, fades,
  arming while Live is stopped, ARM/cancel, Clear, auto stop):
  `node m4l/test/gen_test.js`
- `m4l/loopshifter_live.js`: stops Live and switches the clip off and on again ([js], Live API)
