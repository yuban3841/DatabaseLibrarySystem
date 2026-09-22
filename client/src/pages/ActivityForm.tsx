import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Divider, Form, Input, InputNumber, Select, Space, Switch, TimePicker, DatePicker } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, activityApi } from '../api';
import type { Activity, ActivityCategory, ActivityFormPayload } from '../types';

const FORMAT = 'YYYY-MM-DD HH:mm:ss';
const CATEGORIES: ActivityCategory[] = ['体育', '文艺', '学术', '志愿', '其他'];

interface FormValues {
  title: string;
  category: ActivityCategory;
  description: string;
  cover: string;
  capacity: number;
  auditRequired: boolean;
  range: [Dayjs, Dayjs];
  registerDeadline: Dayjs;
  location: string;
}

export default function ActivityForm() {
  const { activityId } = useParams<{ activityId?: string }>();
  const isEdit = Boolean(activityId);
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  // 已发布活动仅允许改标题 / 描述 / 封面 / 地点
  const frozen = activity?.status === 'PUBLISHED';

  useEffect(() => {
    if (!isEdit || !activityId) return;
    void (async () => {
      setLoading(true);
      try {
        const detail = await activityApi.detail(activityId);
        setActivity(detail);
        form.setFieldsValue({
          title: detail.title,
          category: detail.category,
          description: detail.description,
          cover: detail.cover,
          capacity: detail.capacity,
          auditRequired: detail.auditRequired,
          range: [dayjs(detail.startTime), dayjs(detail.endTime)],
          registerDeadline: dayjs(detail.registerDeadline),
          location: detail.location,
        });
      } catch (error) {
        message.error(error instanceof ApiError ? error.message : '加载活动详情失败');
        navigate('/activities');
      } finally {
        setLoading(false);
      }
    })();
  }, [isEdit, activityId, form, message, navigate]);

  const initialValues = useMemo<Partial<FormValues>>(
    () => ({
      category: '学术',
      capacity: 50,
      auditRequired: false,
    }),
    []
  );

  const handleSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      const payload: ActivityFormPayload = {
        title: values.title.trim(),
        category: values.category,
        description: values.description.trim(),
        cover: values.cover.trim(),
        capacity: values.capacity,
        auditRequired: values.auditRequired,
        startTime: values.range[0].format(FORMAT),
        endTime: values.range[1].format(FORMAT),
        registerDeadline: values.registerDeadline.format(FORMAT),
        location: values.location.trim(),
      };

      if (isEdit && activityId) {
        await activityApi.update(activityId, payload);
        message.success('活动已更新');
      } else {
        await activityApi.create(payload);
        message.success('活动已创建（草稿状态），请回到列表点击「发布」');
      }
      navigate('/activities');
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" style={{ marginBottom: 16 }} onClick={() => navigate('/activities')}>
        返回活动列表
      </Button>

      <Card title={isEdit ? '编辑活动' : '新建活动'} loading={loading}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {frozen && (
            <Alert
              type="warning"
              showIcon
              message="活动已发布：仅标题、描述、封面、地点可修改"
              description="名额、分类、活动时间与报名截止在发布后锁定，如需调整请先「下架」再编辑。"
            />
          )}

          <Form
            form={form}
            layout="vertical"
            initialValues={initialValues}
            onFinish={(values) => void handleSubmit(values)}
            disabled={loading}
          >
            <Form.Item name="title" label="活动标题" rules={[{ required: true, message: '请输入活动标题' }, { max: 50, message: '不超过 50 字' }]}>
              <Input placeholder="例如：第12届校园马拉松" disabled={loading} />
            </Form.Item>

            <Space size="large" align="start" wrap>
              <Form.Item name="category" label="活动分类" rules={[{ required: true, message: '请选择分类' }]}>
                <Select options={CATEGORIES.map((value) => ({ value, label: value }))} disabled={frozen} style={{ width: 140 }} />
              </Form.Item>
              <Form.Item name="capacity" label="名额上限" rules={[{ required: true, message: '请输入名额' }]}>
                <InputNumber min={1} max={9999} disabled={frozen} style={{ width: 120 }} />
              </Form.Item>
              <Form.Item name="auditRequired" label="审核制报名" valuePropName="checked" tooltip="开启后用户报名进入待审核状态">
                <Switch disabled={frozen} checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>
            </Space>

            <Divider style={{ margin: 0 }} />

            <Form.Item name="location" label="活动地点" rules={[{ required: true, message: '请输入活动地点' }, { max: 100, message: '不超过 100 字' }]}>
              <Input placeholder="例如：主楼 A302 机房" disabled={loading} />
            </Form.Item>

            <Space size="large" align="start" wrap>
              <Form.Item
                name="range"
                label="活动起止时间"
                rules={[
                  { required: true, message: '请选择活动时间' },
                  {
                    validator: (_, value: FormValues['range'] | undefined) => {
                      if (!value || !value[0] || !value[1]) return Promise.resolve();
                      if (!value[1].isAfter(value[0])) {
                        return Promise.reject(new Error('结束时间必须晚于开始时间'));
                      }
                      return Promise.resolve();
                    },
                  },
                ]}
              >
                <TimePicker.RangePicker format="YYYY-MM-DD HH:mm" disabled={frozen} style={{ width: 380 }} />
              </Form.Item>

              <Form.Item
                name="registerDeadline"
                label="报名截止时间"
                rules={[{ required: true, message: '请选择报名截止时间' }]}
              >
                <TimePicker format="YYYY-MM-DD HH:mm" disabled={frozen} style={{ width: 220 }} />
              </Form.Item>
            </Space>

            <Form.Item
              shouldUpdate={(prev, next) => prev.range !== next.range || prev.registerDeadline !== next.registerDeadline}
              noStyle
            >
              {({ getFieldValue }) => {
                const range = getFieldValue('range') as FormValues['range'];
                const deadline = getFieldValue('registerDeadline');
                const invalid = range && range[0] && deadline && deadline.isAfter(dayjs(range[0].format(FORMAT)));
                if (!invalid) return null;
                return (
                  <Alert
                    type="warning"
                    showIcon
                    message="报名截止时间晚于活动开始时间，保存将被拒绝"
                    style={{ marginBottom: 16 }}
                  />
                );
              }}
            </Form.Item>

            <Form.Item name="cover" label="封面图片 URL">
              <Input placeholder="https://example.com/cover.jpg" disabled={loading} />
            </Form.Item>

            <Form.Item
              name="description"
              label="活动描述"
              rules={[{ required: true, message: '请输入活动描述' }, { max: 1000, message: '不超过 1000 字' }]}
            >
              <Input.TextArea rows={5} placeholder="活动说明、报名方式、注意事项等" />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <Space>
                <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={submitting}>
                  {isEdit ? '保存修改' : '创建草稿'}
                </Button>
                <Button onClick={() => navigate('/activities')}>取消</Button>
              </Space>
            </Form.Item>
          </Form>
        </Space>
      </Card>
    </div>
  );
}
