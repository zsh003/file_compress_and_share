import React from 'react';
import { Form, Input, Button, Card, message, Modal } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

export const UserProfile = ({ visible, onClose }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = React.useState(false);
  const { user, login, logout } = useAuth();

  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      
      // 创建请求数据
      const updateData = {};
      if (values.newUsername) {
        updateData.new_name = values.newUsername;
      }
      if (values.newPassword) {
        updateData.new_password = values.newPassword;
      }

      // 发送更新请求
      const response = await axios.put('http://localhost:8000/user/update_user', null, {
        params: updateData
      });

      if (response.data.code === 0) {
        message.success('信息更新成功！');
        if (values.newUsername) {
          // 如果更新了用户名，需要更新本地存储和认证状态
          localStorage.setItem('username', values.newUsername);
          login(values.newUsername, localStorage.getItem('token'));
        }
        onClose();
        form.resetFields();
      } else {
        message.error(response.data.msg || '更新失败，请重试');
      }
    } catch (error) {
      console.error('更新失败:', error);
      message.error(error.response?.data?.detail || '更新失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="修改个人信息"
      open={visible}
      onCancel={onClose}
      footer={null}
      destroyOnClose
    >
      <Form
        form={form}
        name="userProfile"
        onFinish={handleSubmit}
        autoComplete="off"
      >
        <Form.Item
          name="newUsername"
          rules={[
            { max: 20, message: '用户名最长20个字符' }
          ]}
        >
          <Input 
            prefix={<UserOutlined />} 
            placeholder="新用户名（可选）" 
          />
        </Form.Item>

        <Form.Item
          name="newPassword"
          rules={[
            { max: 100, message: '密码最长100个字符' }
          ]}
        >
          <Input.Password
            prefix={<LockOutlined />}
            placeholder="新密码（可选）"
          />
        </Form.Item>

        <Form.Item
          name="confirmPassword"
          dependencies={['newPassword']}
          rules={[
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || !getFieldValue('newPassword') || getFieldValue('newPassword') === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('两次输入的密码不一致'));
              },
            }),
          ]}
        >
          <Input.Password
            prefix={<LockOutlined />}
            placeholder="确认新密码"
          />
        </Form.Item>

        <Form.Item>
          <Button 
            type="primary" 
            htmlType="submit" 
            loading={loading}
            style={{ width: '100%' }}
          >
            保存修改
          </Button>
        </Form.Item>
      </Form>
    </Modal>
  );
}; 