import axios from 'axios'

const api = axios.create({ baseURL: '/api/v1' })

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('accessToken')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(r => r, async err => {
  if (err.response?.status === 401) {
    const refresh = localStorage.getItem('refreshToken')
    if (refresh) {
      try {
        const { data } = await axios.post('/api/v1/auth/refresh', { refreshToken: refresh })
        localStorage.setItem('accessToken', data.accessToken)
        localStorage.setItem('refreshToken', data.refreshToken)
        err.config.headers.Authorization = `Bearer ${data.accessToken}`
        return axios(err.config)
      } catch {
        localStorage.clear();
        window.location.href = '/app/login'
      }
    }
  }
  return Promise.reject(err)
})

export default api
