import './archipelago-backdrop.css';

/** Decorative scenery stays outside the interactive, movable 3D board. */
export function ArchipelagoBackdrop() {
  return (
    <picture className="archipelago-backdrop" aria-hidden="true">
      <source
        media="(max-width: 999px) and (orientation: portrait)"
        srcSet={`${import.meta.env.BASE_URL}textures/archipelago-mobile-bokeh.webp`}
      />
      <img
        className="archipelago-backdrop__art"
        src={`${import.meta.env.BASE_URL}textures/archipelago-bokeh.webp`}
        alt=""
        decoding="async"
        fetchPriority="high"
      />
    </picture>
  );
}
