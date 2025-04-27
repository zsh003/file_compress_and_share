import React, { useState } from 'react';
import { Layout, Button, Typography } from 'antd';
import { LogoutOutlined, UserOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { LoginForm } from './components/LoginForm';
import { RegisterForm } from './components/RegisterForm';
import { UserProfile } from './components/UserProfile';
import { AppMenu } from './components/AppMenu';
import { HomePage } from './pages/HomePage';
import { FilesPage } from './pages/FilesPage';
import { SharesPage } from './pages/SharesPage';
import { HistoryPage } from './pages/HistoryPage';

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

const App = () => {
  const { user, logout } = useAuth();
  const [showRegister, setShowRegister] = useState(false);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

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
    <Router>
      <Layout style={{ minHeight: '100vh' }}>
        <Sider 
          trigger={null} 
          collapsible 
          collapsed={collapsed}
          width={240}
          style={{
            background: '#fff',
            boxShadow: '2px 0 8px 0 rgba(29,35,41,.05)'
          }}
        >
          <div style={{ 
            height: '64px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            borderBottom: '1px solid #f0f0f0'
          }}>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {collapsed ? '文件系统' : '文件压缩共享系统'}
            </Typography.Title>
          </div>
          <AppMenu />
        </Sider>
        
        <Layout>
          <Header style={{ 
            background: '#fff', 
            padding: '0 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 1px 4px rgba(0,21,41,.08)'
          }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: '16px', width: 64, height: 64 }}
            />
            
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
          
          <Content style={{ 
            margin: '24px 16px', 
            padding: 24, 
            background: '#fff', 
            minHeight: 280 
          }}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/files" element={<FilesPage />} />
              <Route path="/shares" element={<SharesPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Content>
        </Layout>
      </Layout>
      
      <UserProfile 
        visible={showUserProfile}
        onClose={() => setShowUserProfile(false)}
      />
    </Router>
  );
};

export default App; 