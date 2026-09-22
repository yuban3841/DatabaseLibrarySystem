import { useState } from 'react';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, Space, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { ApiError, USE_MOCK } from '../api';
import { useAuth } from '../auth/useAuth';

interface LoginFormValues {
  username: string;
  password: string;
}

const DEMO_ACCOUNTS = [
  { label: '管理员', account: 'admin', password: 'admin123' },
  { label: '组织人', account: 'org01', password: 'org123' },
  { label: '成员', account: 'u24050814', password: 'user123' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [failedMessage, setFailedMessage] = useState('');

  const doLogin = async (username: string, password: string) => {
    setFailedMessage('');
    setSubmitting(true);
    try {
      await login(username, password);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setFailedMessage(error instanceof ApiError ? error.message : '登录失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="cc-login-bg">
      <Card style={{ width: 420, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 40 }}>🎟️</div>
          <Typography.Title level={3} style={{ margin: '8px 0 0' }}>
            ClubCue 管理端
          </Typography.Title>
          <Typography.Text type="secondary">社团活动报名与签到系统 · 管理员登录</Typography.Text>
        </div>

        {failedMessage && <Alert type="error" message={failedMessage} showIcon style={{ marginBottom: 16 }} />}

        <Form
          layout="vertical"
          initialValues={{ username: USE_MOCK ? 'admin' : '', password: '' }}
          onFinish={(values: LoginFormValues) => void doLogin(values.username.trim(), values.password)}
        >
          <Form.Item name="username" label="账号" rules={[{ required: true, message: '请输入账号（账号名或学号）' }]}>
            <Input prefix={<UserOutlined />} placeholder="admin / org01 / 学号" autoComplete="username" size="large" />
          </Form.Item>

          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" autoComplete="current-password" size="large" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 8 }}>
            <Button type="primary" htmlType="submit" loading={submitting} block size="large">
              登录
            </Button>
          </Form.Item>
        </Form>

        {USE_MOCK && (
          <div>
            <Typography.Text type="secondary">演示账号（点击直接登录）：</Typography.Text>
            <Space wrap style={{ marginTop: 8 }}>
              {DEMO_ACCOUNTS.map((demo) => (
                <Button key={demo.account} size="small" disabled={submitting} onClick={() => void doLogin(demo.account, demo.password)}>
                  {demo.label}：{demo.account}
                </Button>
              ))}
            </Space>
          </div>
        )}
      </Card>
    </div>
  );
}
