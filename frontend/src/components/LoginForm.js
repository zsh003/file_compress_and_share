import React from 'react';
import { Form, Input, Button, Card, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import axios from 'axios';

export const LoginForm = ({ onLoginSuccess, onRegister }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      
      // 创建FormData对象
      const formData = new URLSearchParams();
      formData.append('username', values.username);
      formData.append('password', values.password);
      
      // 发送登录请求
      const response = await axios.post('http://localhost:8000/user/login', formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (response.data.access_token) {
        // 保存token和用户信息到localStorage
        localStorage.setItem('token', response.data.access_token);
        localStorage.setItem('username', response.data.username);
        localStorage.setItem('userId', response.data.user_id);
        
        // 设置axios默认headers
        axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.access_token}`;
        
        message.success('登录成功！');
        onLoginSuccess(response.data.username);
      } else {
        message.error('登录失败，请检查用户名和密码');
      }
    } catch (error) {
      console.error('登录失败:', error);
      message.error(error.response?.data?.detail || '登录失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '100vh',
      background: '#f0f2f5'
    }}>
      <Card title="用户登录" style={{ width: 400 }}>
        <Form
          form={form}
          name="login"
          onFinish={handleSubmit}
          autoComplete="off"
        >
          <Form.Item
            name="username"
            rules={[
              { required: true, message: '请输入用户名' },
              { max: 20, message: '用户名最长20个字符' }
            ]}
          >
            <Input 
              prefix={<UserOutlined />} 
              placeholder="用户名" 
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { max: 100, message: '密码最长100个字符' }
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码"
              size="large"
            />
          </Form.Item>

          <Form.Item>
            <Button 
              type="primary" 
              htmlType="submit" 
              loading={loading}
              style={{ width: '100%', marginBottom: 16 }}
              size="large"
            >
              登录
            </Button>
            <Button 
              type="link" 
              onClick={onRegister}
              style={{ width: '100%' }}
            >
              还没有账号？立即注册
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}; 