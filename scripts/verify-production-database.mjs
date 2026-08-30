const url = process.env.DATABASE_URL?.trim()

if (!url) {
  console.error('[production-database] DATABASE_URL is required')
  process.exit(1)
}

if (!url.startsWith('mongodb://') && !url.startsWith('mongodb+srv://')) {
  console.error('[production-database] refusing to start: this production build requires a MongoDB DATABASE_URL')
  process.exit(1)
}

if (url.startsWith('mongodb://') && !url.includes('replicaSet=')) {
  console.warn('[production-database] warning: DATABASE_URL does not explicitly include replicaSet; verify the MongoDB deployment is a replica set before serving traffic')
}

console.log('[production-database] MongoDB DATABASE_URL detected; continuing startup')
