import api from './client'

export const createSession = (name?: string) =>
  api.post('/sessions', { name }).then((r) => r.data)

export const listSessions = () =>
  api.get('/sessions').then((r) => r.data)

export const getSession = (id: string) =>
  api.get(`/sessions/${id}`).then((r) => r.data)

export const renameSession = (id: string, name: string) =>
  api.patch(`/sessions/${id}/name`, { name }).then((r) => r.data)

export const deleteSession = (id: string) =>
  api.delete(`/sessions/${id}`).then((r) => r.data)

export const resetSession = (id: string) =>
  api.post(`/sessions/${id}/reset`).then((r) => r.data)

export const uploadColumns = (id: string, file: File) => {
  const form = new FormData()
  form.append('file', file)
  return api.post(`/sessions/${id}/uploads/columns`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}

export const uploadForeignKeys = (id: string, file: File) => {
  const form = new FormData()
  form.append('file', file)
  return api.post(`/sessions/${id}/uploads/foreignkeys`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}

export const uploadERDiagram = (id: string, file: File) => {
  const form = new FormData()
  form.append('file', file)
  return api.post(`/sessions/${id}/uploads/er-diagram`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}

export const parseSchema = (id: string) =>
  api.post(`/sessions/${id}/uploads/parse`).then((r) => r.data)

export const runClassification = (id: string, userContext: string, hardOverrides: Record<string, string>) =>
  api.post(`/sessions/${id}/checkpoints/1/classify`, {
    user_context: userContext,
    hard_overrides: hardOverrides,
  }).then((r) => r.data)

export const approveCheckpoint1 = (id: string, classifications: unknown[]) =>
  api.post(`/sessions/${id}/checkpoints/1/approve`, { classifications }).then((r) => r.data)

export const approveCheckpoint2 = (id: string, userComment: string) =>
  api.post(`/sessions/${id}/checkpoints/2/approve`, { user_comment: userComment }).then((r) => r.data)
