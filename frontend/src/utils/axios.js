import axios from 'axios';
import { message } from 'antd';

// 创建axios实例
const instance = axios.create({
  baseURL: 'http://localhost:8000',
  timeout: 30000,
});

// 请求拦截器
instance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
instance.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // 如果是401错误且不是刷新token的请求
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // 尝试刷新token
        const response = await instance.post('/user/refresh_token', {
          refresh_token: localStorage.getItem('refresh_token'),
        });

        if (response.data.access_token) {
          // 更新token
          localStorage.setItem('token', response.data.access_token);
          
          // 更新原请求的header
          originalRequest.headers.Authorization = `Bearer ${response.data.access_token}`;
          
          // 重试原请求
          return instance(originalRequest);
        }
      } catch (refreshError) {
        // 如果刷新token失败，清除所有认证信息并重定向到登录页面
        localStorage.removeItem('token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('username');
        message.error('登录已过期，请重新登录');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    // 显示错误信息
    const errorMessage = error.response?.data?.detail || error.message || '请求失败';
    message.error(errorMessage);
    return Promise.reject(error);
  }
);

export default instance; 