type SoundName = "button" | "bomb" | "explosion" | "powerup" | "hit" | "win" | "loss" | "draw";

const STORAGE_KEY = "yokonex:bomberman:sound-enabled";

class SoundManager {
    private audioContext?: AudioContext;
    private enabled = window.localStorage.getItem(STORAGE_KEY) !== "0";
    private lastPlayedAt: Partial<Record<SoundName, number>> = {};

    isEnabled() {
        return this.enabled;
    }

    setEnabled(enabled: boolean) {
        this.enabled = enabled;
        window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
        if (enabled) {
            void this.unlock();
        }
    }

    toggle() {
        this.setEnabled(!this.enabled);
        return this.enabled;
    }

    async unlock() {
        if (!this.enabled) {
            return;
        }

        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) {
            return;
        }

        this.audioContext ??= new AudioContextCtor();
        if (this.audioContext.state === "suspended") {
            await this.audioContext.resume();
        }
    }

    play(name: SoundName) {
        if (!this.enabled) {
            return;
        }

        const now = Date.now();
        const throttleMs = name === "explosion" ? 180 : name === "hit" ? 120 : 40;
        if ((this.lastPlayedAt[name] ?? 0) + throttleMs > now) {
            return;
        }
        this.lastPlayedAt[name] = now;

        void this.unlock().then(() => {
            if (!this.audioContext) {
                return;
            }

            if (name === "button") {
                this.tone(520, 0.045, "triangle", 0.05);
            } else if (name === "bomb") {
                this.tone(150, 0.1, "sine", 0.08);
            } else if (name === "explosion") {
                this.tone(90, 0.18, "sawtooth", 0.12);
                this.tone(52, 0.22, "square", 0.05, 0.03);
            } else if (name === "powerup") {
                this.tone(660, 0.08, "triangle", 0.07);
                this.tone(920, 0.1, "triangle", 0.05, 0.07);
            } else if (name === "hit") {
                this.tone(210, 0.12, "square", 0.08);
            } else if (name === "win") {
                this.tone(523, 0.1, "triangle", 0.07);
                this.tone(659, 0.1, "triangle", 0.07, 0.09);
                this.tone(784, 0.16, "triangle", 0.07, 0.18);
            } else if (name === "loss") {
                this.tone(260, 0.12, "sine", 0.06);
                this.tone(196, 0.18, "sine", 0.06, 0.12);
            } else {
                this.tone(360, 0.12, "triangle", 0.05);
            }
        });
    }

    private tone(frequency: number, duration: number, type: OscillatorType, volume: number, delay = 0) {
        if (!this.audioContext) {
            return;
        }

        const startAt = this.audioContext.currentTime + delay;
        const oscillator = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, startAt);
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

        oscillator.connect(gain);
        gain.connect(this.audioContext.destination);
        oscillator.start(startAt);
        oscillator.stop(startAt + duration + 0.02);
    }
}

export const soundManager = new SoundManager();

declare global {
    interface Window {
        webkitAudioContext?: typeof AudioContext;
    }
}
