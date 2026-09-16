import type { ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { reportError } from '../app/state.ts';

/**
 * Code-split component loader without preact/compat. The module is fetched the first time the
 * component renders, so heavy screens (editor, 3D engine) never load until they're needed.
 */
export function lazyComponent<P extends object>(loader: () => Promise<ComponentType<P>>, fallback = 'Loading…'): ComponentType<P> {
  let cached: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;
  return function Lazy(props: P) {
    const [Comp, setComp] = useState<ComponentType<P> | null>(() => cached);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
      if (cached) return;
      pending ??= loader();
      let alive = true;
      pending
        .then((c) => {
          cached = c;
          if (alive) setComp(() => c);
        })
        .catch((error: unknown) => {
          pending = null;
          if (alive) setFailed(true);
          reportError(error, 'Part of the app could not be loaded. Check your storage space and try again.');
        });
      return () => {
        alive = false;
      };
    }, []);
    if (failed) {
      return (
        <div class="empty-state">
          <p>This screen could not be loaded.</p>
          <button class="btn" type="button" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      );
    }
    if (!Comp) {
      return (
        <div class="empty-state" role="status">
          {fallback}
        </div>
      );
    }
    return <Comp {...props} />;
  };
}
