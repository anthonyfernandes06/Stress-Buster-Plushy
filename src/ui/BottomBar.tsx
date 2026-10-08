import { useStore } from '../state/store';
import { ResetIcon, VolumeOffIcon, VolumeOnIcon } from './icons';

export function BottomBar() {
  const muted = useStore((s) => s.muted);
  const toggleMute = useStore((s) => s.toggleMute);
  const reset = useStore((s) => s.reset);
  return (
    <div className="bottombar glass">
      <button type="button" className="round-btn" aria-label="Reset room (R)" title="Reset (R)" onClick={reset}>
        <ResetIcon />
      </button>
      <button
        type="button"
        role="switch"
        aria-checked={!muted}
        aria-label="Sound (M)"
        className={`sound-switch${muted ? '' : ' is-on'}`}
        onClick={toggleMute}
      >
        <span className="sound-icon">{muted ? <VolumeOffIcon /> : <VolumeOnIcon />}</span>
        <span className="sound-label">Sound</span>
        <span className="switch-track" aria-hidden="true">
          <span className="switch-knob" />
        </span>
      </button>
    </div>
  );
}
