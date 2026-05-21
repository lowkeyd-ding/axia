import PositionDetailClient from './PositionDetailClient';

// Required for static export with dynamic routes
export async function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export default function PositionDetailPage() {
  return <PositionDetailClient />;
}
