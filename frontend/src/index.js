import React, { useState } from 'react';
import { Layout, Button, Typography } from 'antd';
import { LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginForm } from './components/LoginForm';
import { RegisterForm } from './components/RegisterForm';
import { UserProfile } from './components/UserProfile';
import { FileCompressor } from './components/FileCompressor';

const { Header } = Layout;
const { Title } = Typography;

function App() {
  const { user, logout } = useAuth();
  const [showRegister, setShowRegister] = useState(false);
  const [showUserProfile, setShowUserProfile] = useState(false);

  if (!user) {
    if (showRegister) {
      return (
        <RegisterForm 
          onRegisterSuccess={() => setShowRegister(false)}
          onBackToLogin={() => setShowRegister(false)}
        />
      );
    }
    return (
      <LoginForm 
        onLoginSuccess={(username) => window.location.reload()} 
        onRegister={() => setShowRegister(true)}
      />
    );
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ 
        background: '#fff', 
        padding: '0 50px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Title level={3} style={{ margin: '16px 0' }}>压缩文件安全共享系统</Title>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: 16 }}>欢迎, {user.username}</span>
          <Button 
            icon={<UserOutlined />}
            onClick={() => setShowUserProfile(true)}
            style={{ marginRight: 8 }}
          >
            个人信息
          </Button>
          <Button 
            icon={<LogoutOutlined />}
            onClick={logout}
          >
            退出登录
          </Button>
        </div>
      </Header>
      <FileCompressor />
      
      <UserProfile 
        visible={showUserProfile}
        onClose={() => setShowUserProfile(false)}
      />
    </Layout>
  );
}

const container = document.getElementById('root');
const root = createRoot(container);
root.render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);