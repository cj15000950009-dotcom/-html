import { z } from 'zod';
import _ from 'lodash';

export const Schema = z.object({
  世界: z.object({
    当前时间: z
      .string()
      .describe('当前游戏时间，格式：YYYY-MM-DD HH:mm，用于日程/事件判定'),
    当前地点: z.string().describe('当前所在地点，用于事件触发与界面展示'),
    近期事务: z
      .record(
        z.string().describe('事务名'),
        z.string().describe('事务描述'),
      )
      .optional(),
  }),

  角色: z
    .record(
      z.string().describe('角色ID'),
      z.object({
        好感值: z
          .coerce.number()
          .transform(v => _.clamp(v, 0, 100))
          .describe('对 {{user}} 的情感亲近程度，0-100'),
        性欲值: z
          .coerce.number()
          .transform(v => _.clamp(v, 0, 100))
          .describe('对 {{user}} 的性张力/冲动强度，0-100'),
        直男程度: z
          .coerce.number()
          .transform(v => _.clamp(v, 0, 100))
          .describe('异性恋身份认同与心理防御强度，0-100'),
      }),
    )
    .optional(),

  游戏状态: z
    .object({
      当前场景: z.string().optional().describe('当前叙事分镜或章节名'),
      背景音乐: z.string().optional().describe('当前推荐播放的 BGM 标记'),
      背景图片: z.string().optional().describe('当前场景背景图像资源名'),
    })
    .optional(),
});

export type Schema = z.output<typeof Schema>;
