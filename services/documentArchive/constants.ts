import path from 'path';

export const DATA_DIR = path.join(process.cwd(), 'data', 'student_documents');
export const JOBS_FILE = path.join(process.cwd(), 'data', 'document_jobs.json');
export const DOSSIERS_FILE = path.join(process.cwd(), 'data', 'student_dossiers.json');
export const DOCUMENTS_FILE = path.join(process.cwd(), 'data', 'student_documents_meta.json');
export const BUNDLES_FILE = path.join(process.cwd(), 'data', 'document_bundles.json');
export const DISMISSED_FLAGS_FILE = path.join(process.cwd(), 'data', 'dismissed_flags.json');
export const APPLIED_CORRECTIONS_FILE = path.join(process.cwd(), 'data', 'applied_corrections.json');

export const SINDH_PAKISTANI_CASTES = [
  'Baloch', 'Brohi', 'Khetran', 'Memon', 'Chandio', 'Lashari', 'Magsi',
  'Soomro', 'Rind', 'Solangi', 'Shah', 'Khoso', 'Jatoi', 'Channa',
  'Bhatti', 'Junejo', 'Talpur', 'Qureshi', 'Abbasi', 'Mahar', 'Jamali',
  'Leghari', 'Daudpota', 'Kalhoro', 'Mangrio', 'Kaloi', 'Almani', 'Unar',
  'Keerio', 'Khaskheli', 'Buriro', 'Joyo', 'Khuhro', 'Khooharo', 'Khoharo', 'Khuharo', 'Khoohro', 'Palh', 'Syed',
  'Mallah', 'Panhwar', 'Siyal', 'Zardari', 'Shaikh', 'Siddiqui', 'Ansari',
  'Arain', 'Rajput', 'Mughal', 'Bughio', 'Shahani', 'Nizamani', 'Mangi',
  'Gopang', 'Khatian', 'Kolachi', 'Marri', 'Bugti', 'Mengal', 'Umrani',
  'Chang', 'Larik', 'Wassan', 'Sanjrani', 'Abro', 'Korai', 'Jakhrani',
  'Khosa', 'Gabol', 'Otho', 'Dero', 'Gaho', 'Samejo', 'Sario', 'Machhi',
  'Shoro', 'Lund', 'Bozdar', 'Khero', 'Bajeer', 'Detho', 'Khuhawar',
  'Chachar', 'Kakar', 'Achakzai', 'Khan', 'Malik', 'Chaudhry', 'Cheema',
  'Bajwa', 'Tiwana', 'Wattoo', 'Butt', 'Dar', 'Mir', 'Baig', 'Ghuman',
  'Gill', 'Virk', 'Jutt', 'Jat', 'Khokhar', 'Awan', 'Khattak', 'Afridi',
  'Yousafzai', 'Bangash', 'Shinwari', 'Durrani', 'Tareen', 'Kasi', 'Zehri',
  'Lehri', 'Bijarani', 'Domki', 'Nuhri', 'Halepoto', 'Sahito', 'Thebo',
  'Shar', 'Dahri', 'Tagar', 'Ghanghro', 'Uqaili', 'Qazi', 'Gadhi',
  'Lohar', 'Soomra', 'Sikandar', 'Barfat', 'Kandhro', 'Chalgari',
];

export const SINDHI_NAME_DICTIONARY: Record<string, string> = {
  'شعيب': 'Shoib', 'شعېب': 'Shoib', 'نديم': 'Nadeem', 'برهماڻي': 'Birhamani',
  'برهماني': 'Birhamani', 'سمير': 'Sameer', 'ثنا': 'Sana', 'نمر': 'Nimr',
  'نمرا': 'Nimra', 'رضيه': 'Razia', 'مها': 'Maha', 'گل': 'Gul',
  'احمد': 'Ahmed', 'مرتضي': 'Murtaza', 'مرتضى': 'Murtaza', 'مرتضيٰ': 'Murtaza',
  'مصطفي': 'Mustafa', 'مصطفى': 'Mustafa', 'مصطفيٰ': 'Mustafa', 'امان الله': 'Amanullah',
  'امان': 'Aman', 'عبدالمنان': 'Abdul Manan', 'عبد المنان': 'Abdul Manan',
  'منان': 'Manan', 'علي': 'Ali', 'محمد': 'Muhammad', 'بخش': 'Bux',
  'سنجراڻي': 'Sanjrani', 'لياقت': 'Liaquat', 'کوهارو': 'Khooharo', 'کوھرو': 'Khuhro',
  'کوهرو': 'Khuhro', 'خاصخيلي': 'Khaskheli', 'ميمڻ': 'Memon', 'سومرو': 'Soomro',
  'چانڊيو': 'Chandio', 'سولنگي': 'Solangi', 'لاشاري': 'Lashari', 'مگسي': 'Magsi',
  'رند': 'Rind', 'بلوچ': 'Baloch', 'بروهي': 'Brohi', 'کيتران': 'Khetran',
  'شاهه': 'Shah', 'شاه': 'Shah', 'سيد': 'Syed', 'جوڻيجو': 'Junejo',
  'ڀٽي': 'Bhatti', 'خان': 'Khan', 'پٺاڻ': 'Pathan', 'پٽ': 'Son',
  'ڌيء': 'Daughter', 'مرد': 'Male', 'عورت': 'Female', 'سخي': 'Sakhi',
  'داد': 'Dad', 'غلام': 'Ghulam', 'حسين': 'Hussain', 'حسن': 'Hassan',
  'عباس': 'Abbas', 'عمر': 'Umar', 'عثمان': 'Usman', 'خالد': 'Khalid',
  'طارق': 'Tariq', 'رشيد': 'Rasheed', 'نويد': 'Naveed', 'وقار': 'Waqar',
  'شهزاد': 'Shehzad', 'فرحان': 'Farhan', 'عامر': 'Aamir', 'عرفان': 'Irfan',
  'آصف': 'Asif', 'فاطمه': 'Fatima', 'عائشه': 'Ayesha', 'زينب': 'Zainab',
  'مريم': 'Maryam', 'حفصه': 'Hafsa', 'ثريا': 'Surayya', 'شازيه': 'Shazia',
  'پروين': 'Parveen', 'نسيم': 'Naseem', 'شهيده': 'Shahida', 'ڪوثر': 'Kausar',
  'صائمه': 'Saima', 'نصرت': 'Nusrat', 'بلال': 'Bilal', 'حمزه': 'Hamza',
  'زبيده': 'Zubaida', 'زبيدہ': 'Zubaida', 'طاهره': 'Tahira', 'صغريٰ': 'Sughra',
  'ڪبريٰ': 'Kubra', 'مبشر': 'Mubashir', 'منظور': 'Manzoor', 'مقصود': 'Maqsood',
  'امتياز': 'Imtiaz', 'اعجاز': 'Ijaz', 'سجاد': 'Sajjad', 'اصغر': 'Asghar',
  'اڪبر': 'Akbar', 'اصغر علي': 'Asghar Ali', 'حيدر': 'Haider', 'ذوالفقار': 'Zulfiqar',
  'نديم برهماڻي': 'Nadeem Birhamani', 'شعيب برهماڻي': 'Shoib Birhamani', 'رفعت': 'Riffat',
  'رفعت فاطمه': 'Riffat Fatima', 'طيبه': 'Tayyaba', 'طیبہ': 'Tayyaba', 'سهراب': 'Sohrab',
  'سوراب': 'Sohrab', 'سهراب علي': 'Sohrab Ali', 'سوراب علي': 'Sohrab Ali', 'اشرف': 'Ashraf',
  'بيگم': 'Begum', 'اشرف بيگم': 'Ashraf Begum', 'گوپانگ': 'Gopang', 'ملاح': 'Mallah',
  'رياض': 'Riaz', 'رياض ملاح': 'Riaz Mallah', 'نیازم': 'Niaz', 'فرزانه': 'Farzana',
  'ياسمين': 'Yasmeen', 'روبينا': 'Rubina', 'نورين': 'Noreen', 'ثمينه': 'Samina',
  'شائسته': 'Shaista', 'ڪائنات': 'Kainat', 'دعا': 'Dua', 'مهنور': 'Mahnoor',
  'اقصي': 'Aqsa', 'بشري': 'Bushra', 'حرا': 'Hira', 'اقرا': 'Iqra',
  'ڪرن': 'Kiran', 'انعم': 'Anam', 'سدره': 'Sidra', 'ڪومل': 'Komal',
  'مهڪ': 'Mehak', 'پارس': 'Paras', 'مارئي': 'Marvi', 'سسئي': 'Sassui',
  'بختاور': 'Bakhtawar', 'ساجده': 'Sajida', 'عابده': 'Abida', 'زاهده': 'Zahida',
  'خديجه': 'Khadija', 'سلمه': 'Salma',
};

export const SINDHI_CHAR_MAP: Record<string, string> = {
  'ا': 'a', 'آ': 'aa', 'ب': 'b', 'ٻ': 'b', 'پ': 'p', 'ڀ': 'bh', 'ت': 't', 'ٿ': 'th',
  'ٽ': 't', 'ٺ': 'th', 'ث': 's', 'ج': 'j', 'ڄ': 'j', 'جھ': 'jh', 'جه': 'jh', 'ڃ': 'ny',
  'چ': 'ch', 'ڇ': 'chh', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ڌ': 'dh', 'ڏ': 'd', 'ڊ': 'd',
  'ڍ': 'dh', 'ذ': 'z', 'ر': 'r', 'ڙ': 'r', 'ز': 'z', 'ژ': 'zh', 'س': 's', 'ش': 'sh',
  'ص': 's', 'ض': 'z', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ڦ': 'ph',
  'ق': 'q', 'ڪ': 'k', 'ک': 'kh', 'گ': 'g', 'ڳ': 'g', 'گھ': 'gh', 'گه': 'gh', 'ڱ': 'ng',
  'ل': 'l', 'م': 'm', 'ن': 'n', 'ڻ': 'n', 'ں': 'n', 'و': 'o', 'ه': 'h', 'ھ': 'h',
  'ء': '', 'ي': 'i', 'ى': 'i', 'يٰ': 'a', 'ئ': 'i', 'ې': 'e', 'ے': 'e',
};
