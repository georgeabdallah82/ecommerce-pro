import { Fragment } from 'react'

// An address on one line, each part in its own direction. Joined into one string, an Arabic street next to "Beirut,
// Lebanon" came out scrambled ("جونية ,5 شارع البحر" for "شارع البحر 5, جونية"): the browser laid the Arabic run and
// its number and comma out together, right to left. <bdi> keeps each part whole, in its own direction.
export function AddressParts({ lines, empty }: { lines: string[]; empty: string }) {
  if (!lines.length) return <>{empty}</>
  return <>{lines.map((line, i) => <Fragment key={i}>{i > 0 && ', '}<bdi>{line}</bdi></Fragment>)}</>
}
