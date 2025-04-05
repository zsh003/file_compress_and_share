import React from 'react';
import { Form, Input, Button, Card, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import axios from 'axios';

export const RegisterForm = ({ onRegisterSuccess, onBackToLogin }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      
      // 创建FormData对象
      const formData = new FormData();
      formData.append('username', values.username);
      formData.append('password', values.password);
      
      // 发送注册请求
      const response = await axios.post('http://localhost:8000/user/create_user', formData);

      if (response.data.code === 0) {
        message.success('注册成功！');
        onRegisterSuccess();
      } else {
        message.error(response.data.msg || '注册失败，请重试');
      }
    } catch (error) {
      console.error('注册失败:', error);
      message.error(error.response?.data?.detail || '注册失败，请重试');
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
      <Card title="用户注册" style={{ width: 400 }}>
        <Form
          form={form}
          name="register"
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

          <Form.Item
            name="confirmPassword"
            dependencies={['password']}
            rules={[
              { required: true, message: '请确认密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="确认密码"
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
              注册
            </Button>
            <Button 
              type="link" 
              onClick={onBackToLogin}
              style={{ width: '100%' }}
            >
              返回登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}; 