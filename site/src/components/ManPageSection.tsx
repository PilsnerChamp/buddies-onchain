// `<section>` with an uppercase `<h2>` heading rendered above a `.body`
// container. The page-level `<h1>` is the terminal title emitted by
// `TerminalFrame`; section headings here are `<h2>` for document structure.

import type { ReactNode } from 'react';
import './ManPageSection.css';

type ManPageSectionProps = {
  /**
   * Uppercase heading string (e.g. `NAME`, `DESCRIPTION`, `SEE ALSO`).
   * Case is preserved as-given — consumers ship the exact man-page token.
   */
  heading: string;
  children: ReactNode;
};

export function ManPageSection({
  heading,
  children,
}: ManPageSectionProps): JSX.Element {
  return (
    <section className="man-page-section">
      <h2 className="man-page-section__heading">{heading}</h2>
      <div className="man-page-section__body">{children}</div>
    </section>
  );
}
