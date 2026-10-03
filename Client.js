// Supabase client สำหรับฝั่งเบราว์เซอร์
//
// ใช้ ESM (import/export) เพราะหน้าเว็บเป็น static HTML ที่โหลดผ่าน Live Server
// ถ้าใช้ require() ของ Node เบราว์เซอร์จะรันไม่ได้
//
// ใช้ในหน้าเว็บแบบนี้:
//   import { supabase } from '../Client.js';
//   const { data, error } = await supabase.from('vacant_rooms').select('*');

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
