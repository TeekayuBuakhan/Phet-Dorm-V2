// นำเข้า dotenv เพื่อให้อ่านค่าจากไฟล์ .env ได้
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// ดึงค่าตัวแปรจาก Environment
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

// สร้าง Supabase Client
const supabase = createClient(supabaseUrl, supabaseKey);

// ตัวอย่างฟังก์ชันสำหรับทดสอบการดึงข้อมูล
async function fetchUsers() {
  const { data, error } = await supabase
    .from('users') // เปลี่ยน 'users' เป็นชื่อ table ของคุณ
    .select('*')
    .limit(5);

  if (error) {
    console.error('Error fetching data:', error);
  } else {
    console.log('Connected successfully. Data:', data);
  }
}

fetchUsers();