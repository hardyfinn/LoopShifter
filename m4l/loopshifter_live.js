// loopshifter_live.js: talks to Live for the Loopshifter device ([js]).
//
// "recstart"  the buffer has started recording: remember where in the song
// "auto 0/1"  the AUTO STOP switch
// "done"      the buffer is full: if AUTO STOP is on, switch off the clip that was
//             playing into Loopshifter (on this track) and stop Live
// "clear"     the buffer was cleared: switch those clips back on
//
// "Switch off" means Live's clip activator (the clip's "muted" property), the
// same as pressing 0 on a clip.

inlets = 1;
outlets = 1;

var autoOn = 1;
var recFrom = -1;     // song time (beats) when recording started
var switchedOff = []; // ids of the clips we switched off

function auto(v) { autoOn = v ? 1 : 0; }

function recstart() {
	var set = new LiveAPI("live_set");
	recFrom = Number(set.get("current_song_time"));
}

// the track this device sits on (walks up through racks)
function thisTrack() {
	var p = new LiveAPI("this_device");
	for (var i = 0; i < 8 && p.id != 0; i++) {
		if (p.type == "Track") return p;
		var par = p.get("canonical_parent");
		if (!par || par.length < 2) break;
		p = new LiveAPI("id " + par[1]);
	}
	return null;
}

function switchOff(clip) {
	if (!clip || clip.id == 0) return;
	if (Number(clip.get("muted")) == 1) return;
	clip.set("muted", 1);
	switchedOff.push(clip.id);
}

function done() {
	if (!autoOn) return;
	var set = new LiveAPI("live_set");
	var now = Number(set.get("current_song_time"));
	var tr = thisTrack();
	if (tr) {
		// Session: the clip playing on this track
		var idx = Number(tr.get("playing_slot_index"));
		if (idx >= 0) {
			switchOff(new LiveAPI(tr.unquotedpath + " clip_slots " + idx + " clip"));
		} else {
			// Arrangement: every clip on this track under the part that was just recorded
			var from = recFrom >= 0 && recFrom < now ? recFrom : now - 32;
			var ids = tr.get("arrangement_clips");
			for (var i = 0; i + 1 < ids.length; i += 2) {
				var c = new LiveAPI("id " + ids[i + 1]);
				var st = Number(c.get("start_time")), en = Number(c.get("end_time"));
				if (st < now && en > from) switchOff(c);
			}
		}
	}
	set.call("stop_playing");
	recFrom = -1;
}

function clear() {
	for (var i = 0; i < switchedOff.length; i++) {
		var c = new LiveAPI("id " + switchedOff[i]);
		if (c.id != 0) c.set("muted", 0);
	}
	switchedOff = [];
	recFrom = -1;
}
