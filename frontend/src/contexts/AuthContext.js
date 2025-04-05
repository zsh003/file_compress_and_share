import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 检查本地存储中的认证信息
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    
    if (token && username) {
      // 设置axios默认headers
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setUser({ username });
    }
    
    setLoading(false);
  }, []);

  const login = (username, token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('username', username);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser({ username });
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth必须在AuthProvider中使用');
  }
  return context;
}; 