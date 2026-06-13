/**
 * The VendoPOS logo mark — the colorful cube/arrow glyph. It carries its own
 * gradient and reads on both light and dark surfaces, so it needs no background
 * box. Size it with `className` (default w-8 h-8); pass `animate-pulse` etc. for
 * loader states. Decorative by default since a "VendoPOS" wordmark usually sits
 * beside it — pass `alt` when the mark stands alone.
 */
export function BrandMark({
  className = "w-8 h-8",
  alt = "",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src="/vendo-logo.png"
      alt={alt}
      className={"object-contain shrink-0 " + className}
    />
  );
}
