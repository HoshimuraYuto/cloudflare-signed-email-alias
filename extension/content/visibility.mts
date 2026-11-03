/** The shortest delay Chrome allows when tracking visibility. */
const TRACK_DELAY_MS = 100;

/** IntersectionObserver v2 fields that lib.dom does not declare yet. */
interface VisibilityInit extends IntersectionObserverInit {
  trackVisibility: boolean;
  delay: number;
}

export interface VisibilityWatch {
  /** True only while the browser reports the element unobscured, unclipped and fully opaque. */
  isVisible: () => boolean;
  stop: () => void;
}

/** Lets a click be refused while the page makes the element transparent or covers it. */
export function watchVisibility(element: Element): VisibilityWatch {
  let visible = false;
  const options: VisibilityInit = {
    threshold: [1],
    trackVisibility: true,
    delay: TRACK_DELAY_MS,
  };
  const observer = new IntersectionObserver((entries) => {
    const entry = entries.at(-1);
    visible = entry !== undefined && "isVisible" in entry && entry.isVisible === true;
  }, options);
  observer.observe(element);
  return {
    isVisible: () => visible,
    stop: () => {
      observer.disconnect();
    },
  };
}
