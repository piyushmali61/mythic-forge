export type SearchKind = 'project' | 'asset' | 'template' | 'doc';

export interface SearchDocument {
  id: string;
  kind: SearchKind;
  title: string;
  /** Extra searchable text (tags, creator, description). */
  text: string;
  /** Opaque data for the UI to act on. */
  ref: string;
}

export interface SearchHit {
  doc: SearchDocument;
  score: number;
}

const tokenize = (s: string): string[] =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/**
 * Small in-memory inverted index over installed/local content. Rebuilt on demand
 * (when the search box opens), never in the background.
 */
export class SearchIndex {
  private docs: SearchDocument[] = [];
  private postings = new Map<string, Set<number>>();

  constructor(docs: readonly SearchDocument[] = []) {
    for (const d of docs) this.add(d);
  }

  get size(): number {
    return this.docs.length;
  }

  add(doc: SearchDocument): void {
    const index = this.docs.push(doc) - 1;
    for (const token of new Set([...tokenize(doc.title), ...tokenize(doc.text)])) {
      let set = this.postings.get(token);
      if (!set) {
        set = new Set();
        this.postings.set(token, set);
      }
      set.add(index);
    }
  }

  search(query: string, limit = 20, kinds?: readonly SearchKind[]): SearchHit[] {
    const terms = tokenize(query);
    if (terms.length === 0) return [];
    // AND semantics: a document must match every term (prefix match; exact token scores higher).
    let scores: Map<number, number> | null = null;
    for (const term of terms) {
      const termScores = new Map<number, number>();
      for (const [token, set] of this.postings) {
        if (!token.startsWith(term)) continue;
        const weight = token === term ? 3 : 1;
        for (const i of set) termScores.set(i, Math.max(termScores.get(i) ?? 0, weight));
      }
      if (scores === null) {
        scores = termScores;
      } else {
        const next = new Map<number, number>();
        for (const [i, s] of scores) {
          const t = termScores.get(i);
          if (t !== undefined) next.set(i, s + t);
        }
        scores = next;
      }
    }
    const hits: SearchHit[] = [];
    if (!scores) return hits;
    for (const [i, score] of scores) {
      const doc = this.docs[i]!;
      if (kinds && !kinds.includes(doc.kind)) continue;
      const titleBoost = doc.title.toLowerCase().includes(query.toLowerCase().trim()) ? 5 : 0;
      hits.push({ doc, score: score + titleBoost });
    }
    return hits.sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title)).slice(0, limit);
  }
}
