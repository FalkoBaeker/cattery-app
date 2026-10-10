export type BrandImageName = 'today' | 'breeding' | 'waitlist' | 'calendar' | 'more' | 'cat-family';

/** Decorative artwork is named by the adjacent navigation or empty-state text. */
export function BrandImage({
  name,
  className = '',
}: {
  name: BrandImageName;
  className?: string;
}) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}brand/${name}.png`}
      alt=""
      aria-hidden="true"
      draggable={false}
      width={160}
      height={160}
      decoding="async"
      className={['brand-image object-contain', className].join(' ')}
    />
  );
}
