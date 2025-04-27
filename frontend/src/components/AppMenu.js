import React, { useState } from 'react';
import { Menu } from 'antd';
import { 
  HomeOutlined, 
  FileOutlined, 
  ShareAltOutlined,
  HistoryOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';

export const AppMenu = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // 确定当前选中的菜单项
  const getSelectedKey = () => {
    const path = location.pathname;
    if (path === '/') return 'home';
    if (path === '/files') return 'files';
    if (path === '/shares') return 'shares';
    if (path === '/history') return 'history';
    return 'home';
  };

  const handleMenuClick = (e) => {
    switch (e.key) {
      case 'home':
        navigate('/');
        break;
      case 'files':
        navigate('/files');
        break;
      case 'shares':
        navigate('/shares');
        break;
      case 'history':
        navigate('/history');
        break;
      default:
        navigate('/');
    }
  };

  return (
    <Menu
      mode="inline"
      selectedKeys={[getSelectedKey()]}
      onClick={handleMenuClick}
      style={{ height: '100%', borderRight: 0 }}
      items={[
        {
          key: 'home',
          icon: <HomeOutlined />,
          label: '首页',
        },
        {
          key: 'files',
          icon: <FileOutlined />,
          label: '我的文件',
        },
        {
          key: 'shares',
          icon: <ShareAltOutlined />,
          label: '共享管理',
        },
        {
          key: 'history',
          icon: <HistoryOutlined />,
          label: '历史记录',
        },
      ]}
    />
  );
}; 