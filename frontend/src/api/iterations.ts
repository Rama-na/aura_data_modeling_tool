import api from './client'

export const listIterations = (sessionId: string) =>
  api.get(`/sessions/${sessionId}/iterations`).then((r) => r.data)

export const getIteration = (sessionId: string, iterIdx: number) =>
  api.get(`/sessions/${sessionId}/iterations/${iterIdx}`).then((r) => r.data)

export const submitComment = (sessionId: string, comment: string) =>
  api.post(`/sessions/${sessionId}/iterations`, { user_comment: comment }).then((r) => r.data)

export const generateNotebooks = (sessionId: string, fromIterIdx?: number) =>
  api.post(`/sessions/${sessionId}/notebooks`, {
    from_iter_idx: fromIterIdx ?? null,
  }).then((r) => r.data)

export const getNotebookStatus = (sessionId: string) =>
  api.get(`/sessions/${sessionId}/notebooks/status`).then((r) => r.data)

export const getNotebookManifest = (sessionId: string) =>
  api.get(`/sessions/${sessionId}/notebooks/manifest`).then((r) => r.data)

export const combineNotebooks = (sessionId: string, withPolish = false) =>
  api.post(`/sessions/${sessionId}/notebooks/combine`, { with_polish: withPolish }).then((r) => r.data)

export const getCombineStatus = (sessionId: string) =>
  api.get(`/sessions/${sessionId}/notebooks/combine/status`).then((r) => r.data)

export const combinedNotebookDownloadUrl = (sessionId: string) =>
  `/api/v1/sessions/${sessionId}/notebooks/combined.ipynb/download`
