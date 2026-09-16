import { useEffect, useRef, useState } from 'preact/hooks';
import type { LibraryItem } from '../../app/catalog-service.ts';
import { settings, svc } from '../../app/state.ts';
import { Icon } from '../../ui/Icon.tsx';

/**
 * Thumbnail that is rendered only once the card scrolls into view, and only if thumbnails
 * are enabled in battery settings. Results are cached on disk.
 */
export function AssetThumb({ item, large }: { item: LibraryItem; large?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const quality = settings.value.battery.thumbnailQuality;
  const size = large ? 512 : quality === 'medium' ? 256 : 160;

  useEffect(() => {
    if (item.entry.kind === 'material' || quality === 'off') return;
    const el = ref.current;
    if (!el) return;
    let alive = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        svc()
          .catalogs.thumbnail(item, size)
          .then((u) => alive && setUrl(u))
          .catch(() => alive && setFailed(true));
      },
      { rootMargin: '100px' },
    );
    observer.observe(el);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [item.entry.id, item.entry.version, size, quality]);

  const m = item.entry.material;
  return (
    <div class="asset-thumb" ref={ref}>
      {m ? (
        <div
          class="swatch"
          style={{
            background: `radial-gradient(circle at 35% 30%, ${m.emissiveIntensity > 0 ? m.emissive : '#ffffff55'}, ${m.color} 45%, ${m.color})`,
          }}
          aria-hidden="true"
        />
      ) : url ? (
        <img src={url} alt="" />
      ) : (
        <Icon name={failed ? 'alert' : 'cube'} size={large ? 64 : 36} />
      )}
      {!item.published && (
        <span class="badge warning" title="Awaiting studio licence sign-off. Visible in development builds only.">
          Pending review
        </span>
      )}
    </div>
  );
}
