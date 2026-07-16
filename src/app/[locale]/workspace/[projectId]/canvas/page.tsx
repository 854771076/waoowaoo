import ProductionCanvasClient from './ProductionCanvasClient'

interface ProductionCanvasPageProps {
  params: Promise<{
    projectId: string
  }>
}

export default async function ProductionCanvasPage({ params }: ProductionCanvasPageProps) {
  const { projectId } = await params
  return <ProductionCanvasClient projectId={projectId} />
}
