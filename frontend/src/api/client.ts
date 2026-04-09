import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// Unwrap the standard envelope { success, data, error }
api.interceptors.response.use(
  (res) => {
    if (res.data && typeof res.data === 'object' && 'data' in res.data) {
      return { ...res, data: res.data.data }
    }
    return res
  },
  (err) => {
    const msg = err.response?.data?.error || err.response?.data?.detail || err.message
    return Promise.reject(new Error(msg))
  }
)

export default api
