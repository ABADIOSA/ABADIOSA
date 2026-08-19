/* Bilingual copy. Arabic is the house language; English is the second print. */
(function (CH) {
  'use strict';

  const STRINGS = {
    ar: {
      dir: 'rtl',
      locale: 'ar',
      appName: 'دار العرض',
      booting: 'تشغيل دار العرض…',

      nowShowing: 'يُعرض الآن',
      comingSoon: 'قريباً في دور العرض',
      showtimes: 'مواعيد العرض',
      todayProgramme: 'برنامج اليوم',
      screen: 'صالة',
      hall: 'القاعة',
      seats: 'مقعد',
      nextShow: 'العرض القادم',
      startsIn: 'يبدأ بعد {n} دقيقة',
      startingNow: 'يبدأ الآن',
      soldOut: 'اكتملت المقاعد',
      opensOn: 'يُعرض ابتداءً من {date}',
      inTheatres: 'في الصالات',

      play: 'ابدأ العرض',
      watchTrailer: 'شاهد الإعلان',
      details: 'التفاصيل',
      back: 'رجوع',
      browse: 'تصفّح',
      search: 'بحث',
      settings: 'الإعدادات',
      selectSource: 'اختر مصدر العرض',
      noStreams: 'لا توجد مصادر عرض متاحة لهذا الفيلم',
      loading: 'جارٍ التحميل…',
      buffering: 'جارٍ تجهيز العرض',
      searching: 'جارٍ البحث…',
      noResults: 'لا توجد نتائج',
      typeToSearch: 'اكتب اسم الفيلم…',

      // Pre-show bumpers
      bumperSilence: 'الرجاء إسكات الهواتف',
      bumperSilenceSub: 'شكراً لتعاونكم',
      bumperNoRecord: 'ممنوع التصوير والتسجيل',
      bumperNoRecordSub: 'احتراماً لحقوق العمل',
      bumperExit: 'مخارج الطوارئ على جانبي الصالة',
      bumperExitSub: 'سلامتكم تهمّنا',
      bumperEnjoy: 'نتمنى لكم مشاهدة ممتعة',
      bumperEnjoySub: 'استمتعوا بالعرض',
      bumperFeature: 'العرض الرئيسي',
      bumperTrailers: 'إعلانات الأفلام القادمة',
      bumperWelcome: 'أهلاً بكم في {name}',
      bumperWelcomeSub: 'يبدأ العرض بعد قليل',

      presents: 'يقدّم',
      featurePresentation: 'العرض الرئيسي',
      theEnd: 'انتهى العرض',

      // Settings
      setDisplay: 'العرض والشاشة',
      setSources: 'المصادر والإضافات',
      setShow: 'تجربة السينما',
      setAccount: 'حساب Stremio',
      setAbout: 'عن البرنامج',

      optKiosk: 'وضع الصالة (ملء الشاشة بلا إطار)',
      optKioskHint: 'يخفي شريط المهام وحواف النوافذ حتى لا تظهر أي علامة على أن المصدر حاسوب.',
      optScreen: 'الشاشة المستخدمة',
      optScreenHint: 'اختر شاشة التلفزيون عند توصيل أكثر من شاشة.',
      optScreenAuto: 'تلقائي (الشاشة الخارجية)',
      optOverscan: 'هامش أمان حواف التلفزيون',
      optOverscanHint: 'بعض شاشات التلفزيون تقصّ الحواف؛ زد الهامش إذا اختفى جزء من الواجهة.',
      optCursor: 'إخفاء مؤشر الفأرة',
      optClock: 'ساعة ٢٤ ساعة',
      optLaunch: 'تشغيل تلقائي عند بدء النظام',
      optLanguage: 'اللغة',

      optAttract: 'شاشة الاستراحة (اللوبي)',
      optAttractHint: 'بعد فترة سكون يعود البرنامج إلى دورة الإعلانات والمواعيد تلقائياً.',
      optIdle: 'مدة السكون قبل اللوبي',
      optSlide: 'مدة كل شريحة',
      optTrailers: 'تشغيل الإعلانات في اللوبي',
      optMuted: 'كتم صوت اللوبي',
      optPreshow: 'مقدمة ما قبل الفيلم',
      optPreshowHint: 'ستارة، تنبيهات الصالة، إعلانات الأفلام القادمة، ثم بطاقة الفيلم والعدّاد.',
      optPreshowCount: 'عدد الإعلانات قبل الفيلم',
      optBumpers: 'تنبيهات الصالة',
      optCountdown: 'عدّاد بداية الفيلم',
      optCinemaName: 'اسم الصالة',
      optScreens: 'عدد الصالات',
      optFirstShow: 'أول عرض',
      optLastShow: 'آخر عرض',
      optGap: 'الفاصل بين العروض (دقيقة)',

      addonAdd: 'إضافة إضافة جديدة',
      addonUrl: 'رابط manifest.json',
      addonAdded: 'تمت إضافة {name}',
      addonRemove: 'إزالة',
      addonInstalled: 'الإضافات المثبّتة',
      serverStatus: 'خادم البث',
      serverOnline: 'متصل',
      serverOffline: 'غير متصل',
      serverHint: 'مطلوب لتشغيل روابط التورنت. الروابط المباشرة تعمل بدونه.',

      signIn: 'تسجيل الدخول',
      signOut: 'تسجيل الخروج',
      email: 'البريد الإلكتروني',
      password: 'كلمة المرور',
      signedInAs: 'مسجّل الدخول باسم {email}',
      signInHint: 'اختياري — لجلب إضافاتك المثبّتة في حساب Stremio.',
      signInOk: 'تم تسجيل الدخول، وجلبنا {n} إضافة',

      exit: 'إغلاق البرنامج',
      reload: 'تحديث البرنامج',
      demoNotice: 'يعمل ببرنامج تجريبي — أضف إضافة Stremio لعرض كتالوج حقيقي',
      serverNeeded: 'هذا المصدر تورنت ويحتاج خادم بث Stremio يعمل على جهازك',
      externalOnly: 'هذا المصدر يفتح في المتصفح',
      unsupported: 'هذا المصدر غير مدعوم',

      hintNavigate: 'تنقّل',
      hintSelect: 'اختيار',
      hintBack: 'رجوع',
      hintSettings: 'الإعدادات',
    },

    en: {
      dir: 'ltr',
      locale: 'en',
      appName: 'CINEMA HALL',
      booting: 'Opening the house…',

      nowShowing: 'Now Showing',
      comingSoon: 'Coming Soon',
      showtimes: 'Showtimes',
      todayProgramme: "Today's Programme",
      screen: 'Screen',
      hall: 'Auditorium',
      seats: 'seats',
      nextShow: 'Next show',
      startsIn: 'Starts in {n} min',
      startingNow: 'Starting now',
      soldOut: 'Sold out',
      opensOn: 'Opens {date}',
      inTheatres: 'In theatres',

      play: 'Start the Show',
      watchTrailer: 'Watch Trailer',
      details: 'Details',
      back: 'Back',
      browse: 'Browse',
      search: 'Search',
      settings: 'Settings',
      selectSource: 'Choose a source',
      noStreams: 'No sources available for this title',
      loading: 'Loading…',
      buffering: 'Preparing the reel',
      searching: 'Searching…',
      noResults: 'No results',
      typeToSearch: 'Type a title…',

      bumperSilence: 'Please silence your phones',
      bumperSilenceSub: 'Thank you',
      bumperNoRecord: 'No recording of any kind',
      bumperNoRecordSub: 'Respect the work',
      bumperExit: 'Emergency exits are on both sides',
      bumperExitSub: 'Your safety matters',
      bumperEnjoy: 'Enjoy the show',
      bumperEnjoySub: 'Sit back and relax',
      bumperFeature: 'Feature Presentation',
      bumperTrailers: 'Coming Attractions',
      bumperWelcome: 'Welcome to {name}',
      bumperWelcomeSub: 'Tonight’s programme begins shortly',

      presents: 'presents',
      featurePresentation: 'Feature Presentation',
      theEnd: 'The End',

      setDisplay: 'Display',
      setSources: 'Sources & Add-ons',
      setShow: 'Cinema Experience',
      setAccount: 'Stremio Account',
      setAbout: 'About',

      optKiosk: 'Auditorium mode (frameless fullscreen)',
      optKioskHint: 'Hides the taskbar and every window edge so nothing gives away the computer.',
      optScreen: 'Output display',
      optScreenHint: 'Pick the television when more than one screen is connected.',
      optScreenAuto: 'Automatic (external screen)',
      optOverscan: 'TV safe-area margin',
      optOverscanHint: 'Some televisions crop the edges — raise this if the UI is cut off.',
      optCursor: 'Hide the mouse pointer',
      optClock: '24-hour clock',
      optLaunch: 'Launch at system start',
      optLanguage: 'Language',

      optAttract: 'Lobby attract loop',
      optAttractHint: 'After a period of quiet the app returns to the trailer and showtime loop.',
      optIdle: 'Idle before the lobby',
      optSlide: 'Seconds per slide',
      optTrailers: 'Play trailers in the lobby',
      optMuted: 'Mute the lobby',
      optPreshow: 'Pre-show before the feature',
      optPreshowHint: 'Curtain, house notices, coming attractions, then the title card and countdown.',
      optPreshowCount: 'Trailers before the feature',
      optBumpers: 'House notices',
      optCountdown: 'Countdown leader',
      optCinemaName: 'House name',
      optScreens: 'Number of screens',
      optFirstShow: 'First show',
      optLastShow: 'Last show',
      optGap: 'Minutes between shows',

      addonAdd: 'Add an add-on',
      addonUrl: 'manifest.json URL',
      addonAdded: 'Added {name}',
      addonRemove: 'Remove',
      addonInstalled: 'Installed add-ons',
      serverStatus: 'Streaming server',
      serverOnline: 'Online',
      serverOffline: 'Offline',
      serverHint: 'Needed for torrent sources. Direct links play without it.',

      signIn: 'Sign in',
      signOut: 'Sign out',
      email: 'Email',
      password: 'Password',
      signedInAs: 'Signed in as {email}',
      signInHint: 'Optional — pulls the add-ons already installed on your Stremio account.',
      signInOk: 'Signed in — {n} add-ons loaded',

      exit: 'Quit',
      reload: 'Refresh programme',
      demoNotice: 'Running the demo house — add a Stremio add-on for a real catalogue',
      serverNeeded: 'This is a torrent source and needs a Stremio streaming server running',
      externalOnly: 'This source opens in a browser',
      unsupported: 'This source is not supported',

      hintNavigate: 'Navigate',
      hintSelect: 'Select',
      hintBack: 'Back',
      hintSettings: 'Settings',
    },
  };

  let current = 'ar';

  CH.i18n = {
    get lang() {
      return current;
    },
    set(lang) {
      current = STRINGS[lang] ? lang : 'ar';
      document.documentElement.lang = current;
      document.documentElement.dir = STRINGS[current].dir;
      return current;
    },
    get dir() {
      return STRINGS[current].dir;
    },
    /** t('startsIn', {n: 12}) */
    t(key, vars) {
      const table = STRINGS[current] || STRINGS.ar;
      let value = table[key];
      if (value === undefined) value = (STRINGS.en[key] !== undefined ? STRINGS.en[key] : key);
      if (vars) {
        for (const [k, v] of Object.entries(vars)) value = value.split(`{${k}}`).join(String(v));
      }
      return value;
    },
    /** Locale-aware clock. Arabic uses Latin digits here so times stay readable at distance. */
    time(date, clock24) {
      const d = date instanceof Date ? date : new Date(date);
      return d.toLocaleTimeString(current === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: !clock24,
      });
    },
    date(date) {
      const d = date instanceof Date ? date : new Date(date);
      return d.toLocaleDateString(current === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    },
    languages: () => Object.keys(STRINGS),
  };
})((window.CH = window.CH || {}));
