"""
SOLARIX — DISCOM Master Data & Utility Functions
Provides normalized electricity distribution company metadata across Indian states.
"""

from typing import List, Dict, Any, Optional

DISCOMS_DATA: List[Dict[str, Any]] = [
    # Maharashtra
    {
        "id": "msedcl",
        "code": "MSEDCL",
        "name": "Maharashtra State Electricity Distribution Company Limited (Mahavitaran)",
        "state": "Maharashtra",
        "short_name": "MSEDCL",
        "licensee_title": "Additional Executive Engineer, MSEDCL",
        "cities": ["Mumbai Suburban", "Pune", "Nagpur", "Nashik", "Aurangabad", "Thane", "Kolhapur", "Solapur", "Amravati", "Nanded"]
    },
    {
        "id": "best_mumbai",
        "code": "BEST",
        "name": "Brihanmumbai Electric Supply and Transport (BEST Undertaking)",
        "state": "Maharashtra",
        "short_name": "BEST",
        "licensee_title": "Executive Engineer, BEST",
        "cities": ["Mumbai City", "South Mumbai", "Colaba", "Dadar", "Mahim"]
    },
    {
        "id": "tata_power_mumbai",
        "code": "TPML",
        "name": "Tata Power Company Limited (Mumbai Distribution)",
        "state": "Maharashtra",
        "short_name": "Tata Power Mumbai",
        "licensee_title": "Head - Distribution, Tata Power",
        "cities": ["Mumbai", "Bandra", "Andheri", "Borivali", "Chembur"]
    },
    {
        "id": "aeml_mumbai",
        "code": "AEML",
        "name": "Adani Electricity Mumbai Limited",
        "state": "Maharashtra",
        "short_name": "Adani Electricity",
        "licensee_title": "Authorized Signatory, Adani Electricity",
        "cities": ["Mumbai Suburban", "Mira-Bhayandar"]
    },

    # Rajasthan
    {
        "id": "jvvnl",
        "code": "JVVNL",
        "name": "Jaipur Vidyut Vitran Nigam Limited",
        "state": "Rajasthan",
        "short_name": "JVVNL (Jaipur Discom)",
        "licensee_title": "Executive Engineer (O&M), JVVNL",
        "cities": ["Jaipur", "Alwar", "Bharatpur", "Dausa", "Dholpur", "Kota", "Jhalawar", "Baran", "Bundi", "Sawai Madhopur", "Karauli"]
    },
    {
        "id": "avvnl",
        "code": "AVVNL",
        "name": "Ajmer Vidyut Vitran Nigam Limited",
        "state": "Rajasthan",
        "short_name": "AVVNL (Ajmer Discom)",
        "licensee_title": "Executive Engineer (O&M), AVVNL",
        "cities": ["Ajmer", "Bhilwara", "Nagaur", "Udaipur", "Rajsamand", "Chittorgarh", "Banswara", "Dungarpur", "Pratapgarh", "Sikar", "Jhunjhunu"]
    },
    {
        "id": "jdvvnl",
        "code": "JdVVNL",
        "name": "Jodhpur Vidyut Vitran Nigam Limited",
        "state": "Rajasthan",
        "short_name": "JdVVNL (Jodhpur Discom)",
        "licensee_title": "Executive Engineer (O&M), JdVVNL",
        "cities": ["Jodhpur", "Bikaner", "Barmer", "Jaisalmer", "Jalore", "Pali", "Sirohi", "Churu", "Hanumangarh", "Sri Ganganagar"]
    },

    # Gujarat
    {
        "id": "dgvcl",
        "code": "DGVCL",
        "name": "Dakshin Gujarat Vij Company Limited",
        "state": "Gujarat",
        "short_name": "DGVCL",
        "licensee_title": "Executive Engineer, DGVCL",
        "cities": ["Surat", "Valsad", "Navsari", "Tapi", "Dangs", "Bharuch", "Narmada"]
    },
    {
        "id": "mgvcl",
        "code": "MGVCL",
        "name": "Madhya Gujarat Vij Company Limited",
        "state": "Gujarat",
        "short_name": "MGVCL",
        "licensee_title": "Executive Engineer, MGVCL",
        "cities": ["Vadodara", "Anand", "Kheda", "Panchmahal", "Dahod", "Mahisagar", "Chhota Udepur"]
    },
    {
        "id": "pgvcl",
        "code": "PGVCL",
        "name": "Paschim Gujarat Vij Company Limited",
        "state": "Gujarat",
        "short_name": "PGVCL",
        "licensee_title": "Executive Engineer, PGVCL",
        "cities": ["Rajkot", "Jamnagar", "Junagadh", "Bhavnagar", "Porbandar", "Amreli", "Surendranagar", "Kutch", "Morbi", "Botad", "Gir Somnath", "Devbhoomi Dwarka"]
    },
    {
        "id": "ugvcl",
        "code": "UGVCL",
        "name": "Uttar Gujarat Vij Company Limited",
        "state": "Gujarat",
        "short_name": "UGVCL",
        "licensee_title": "Executive Engineer, UGVCL",
        "cities": ["Mehsana", "Sabarkantha", "Banaskantha", "Patan", "Aravalli", "Gandhinagar", "Ahmedabad (Rural)"]
    },
    {
        "id": "torrent_power_gujarat",
        "code": "TORRENT_GUJ",
        "name": "Torrent Power Limited (Gujarat)",
        "state": "Gujarat",
        "short_name": "Torrent Power",
        "licensee_title": "General Manager - Distribution, Torrent Power",
        "cities": ["Ahmedabad", "Gandhinagar", "Surat"]
    },

    # Madhya Pradesh
    {
        "id": "mppkvvcl_indore",
        "code": "MPPKVVCL",
        "name": "M.P. Paschim Kshetra Vidyut Vitaran Company Limited",
        "state": "Madhya Pradesh",
        "short_name": "MPPKVVCL (West - Indore)",
        "licensee_title": "Executive Engineer (O&M), MPPKVVCL",
        "cities": ["Indore", "Ujjain", "Dewas", "Ratlam", "Mandsaur", "Neemuch", "Khandwa", "Khargone", "Dhar", "Jhabua", "Alirajpur", "Barwani", "Burhanpur", "Agar Malwa", "Shajapur"]
    },
    {
        "id": "mpmkvvcl_bhopal",
        "code": "MPMKVVCL",
        "name": "M.P. Madhya Kshetra Vidyut Vitaran Company Limited",
        "state": "Madhya Pradesh",
        "short_name": "MPMKVVCL (Central - Bhopal)",
        "licensee_title": "Executive Engineer (O&M), MPMKVVCL",
        "cities": ["Bhopal", "Gwalior", "Guna", "Sehore", "Vidisha", "Raisen", "Rajgarh", "Hoshangabad", "Harda", "Betul", "Sheopur", "Morena", "Bhind", "Gwalior", "Datia", "Shivpuri", "Ashoknagar"]
    },
    {
        "id": "mppokvvcl_jabalpur",
        "code": "MPPoKVVCL",
        "name": "M.P. Poorv Kshetra Vidyut Vitaran Company Limited",
        "state": "Madhya Pradesh",
        "short_name": "MPPoKVVCL (East - Jabalpur)",
        "licensee_title": "Executive Engineer (O&M), MPPoKVVCL",
        "cities": ["Jabalpur", "Sagar", "Rewa", "Satna", "Singrauli", "Chhatarpur", "Damoh", "Panna", "Tikamgarh", "Katni", "Narsinghpur", "Mandla", "Dindori", "Seoni", "Chhindwara", "Balaghat", "Sidhi", "Shahdol", "Umaria", "Anuppur"]
    },

    # Karnataka
    {
        "id": "bescom",
        "code": "BESCOM",
        "name": "Bangalore Electricity Supply Company Limited",
        "state": "Karnataka",
        "short_name": "BESCOM",
        "licensee_title": "Executive Engineer (Elec), BESCOM",
        "cities": ["Bengaluru Urban", "Bengaluru Rural", "Chikkaballapura", "Kolar", "Davangere", "Tumakuru", "Chitradurga", "Ramanagara"]
    },
    {
        "id": "mescom",
        "code": "MESCOM",
        "name": "Mangalore Electricity Supply Company Limited",
        "state": "Karnataka",
        "short_name": "MESCOM",
        "licensee_title": "Executive Engineer (Elec), MESCOM",
        "cities": ["Dakshina Kannada", "Udupi", "Shivamogga", "Chikkamagaluru"]
    },
    {
        "id": "hescom",
        "code": "HESCOM",
        "name": "Hubli Electricity Supply Company Limited",
        "state": "Karnataka",
        "short_name": "HESCOM",
        "licensee_title": "Executive Engineer (Elec), HESCOM",
        "cities": ["Dharwad", "Belagavi", "Bagalkote", "Vijayapura", "Gadag", "Haveri", "Uttara Kannada"]
    },
    {
        "id": "gescom",
        "code": "GESCOM",
        "name": "Gulbarga Electricity Supply Company Limited",
        "state": "Karnataka",
        "short_name": "GESCOM",
        "licensee_title": "Executive Engineer (Elec), GESCOM",
        "cities": ["Kalaburagi", "Ballari", "Bidar", "Koppal", "Raichur", "Yadgir", "Vijayanagara"]
    },
    {
        "id": "chescom",
        "code": "CHESCOM",
        "name": "Chamundeshwari Electricity Supply Corporation Limited",
        "state": "Karnataka",
        "short_name": "CHESCOM",
        "licensee_title": "Executive Engineer (Elec), CHESCOM",
        "cities": ["Mysuru", "Chamarajanagar", "Mandya", "Hassan", "Kodagu"]
    },

    # Uttar Pradesh
    {
        "id": "dvvnl",
        "code": "DVVNL",
        "name": "Dakshinanchal Vidyut Vitran Nigam Limited",
        "state": "Uttar Pradesh",
        "short_name": "DVVNL (Agra Discom)",
        "licensee_title": "Executive Engineer, DVVNL",
        "cities": ["Agra", "Mathura", "Aligarh", "Hathras", "Firozabad", "Mainpuri", "Jhansi", "Lalitpur", "Jalaun", "Banda", "Hamirpur", "Mahoba", "Chitrakoot", "Etawah", "Farrukhabad", "Kannauj", "Auraiya", "Kasganj", "Etah"]
    },
    {
        "id": "mvvnl",
        "code": "MVVNL",
        "name": "Madhyanchal Vidyut Vitaran Nigam Limited",
        "state": "Uttar Pradesh",
        "short_name": "MVVNL (Lucknow Discom)",
        "licensee_title": "Executive Engineer, MVVNL",
        "cities": ["Lucknow", "Ayodhya", "Bareilly", "Badaun", "Pilibhit", "Shahjahanpur", "Rae Bareli", "Unnao", "Sitapur", "Lakhimpur Kheri", "Hardoi", "Amethi", "Barabanki", "Sultanpur", "Gonda", "Bahraich", "Balrampur", "Shravasti", "Ambedkar Nagar"]
    },
    {
        "id": "pvvnl",
        "code": "PVVNL",
        "name": "Paschimanchal Vidyut Vitran Nigam Limited",
        "state": "Uttar Pradesh",
        "short_name": "PVVNL (Meerut Discom)",
        "licensee_title": "Executive Engineer, PVVNL",
        "cities": ["Meerut", "Ghaziabad", "Gautam Buddha Nagar", "Bulandshahr", "Hapur", "Baghpat", "Saharanpur", "Muzaffarnagar", "Shamli", "Moradabad", "Bijnor", "Rampur", "Amroha", "Sambhal"]
    },
    {
        "id": "puvvnl",
        "code": "PuVVNL",
        "name": "Purvanchal Vidyut Vitaran Nigam Limited",
        "state": "Uttar Pradesh",
        "short_name": "PuVVNL (Varanasi Discom)",
        "licensee_title": "Executive Engineer, PuVVNL",
        "cities": ["Varanasi", "Prayagraj", "Gorakhpur", "Azamgarh", "Jaunpur", "Ghazipur", "Chandauli", "Mirzapur", "Sonbhadra", "Bhadohi", "Mau", "Ballia", "Deoria", "Kushinagar", "Maharajganj", "Basti", "Sant Kabir Nagar", "Siddharthnagar", "Kaushambi", "Fatehpur", "Pratapgarh"]
    },
    {
        "id": "kesco",
        "code": "KESCO",
        "name": "Kanpur Electricity Supply Company Limited",
        "state": "Uttar Pradesh",
        "short_name": "KESCO",
        "licensee_title": "Executive Engineer, KESCO",
        "cities": ["Kanpur Nagar"]
    },
    {
        "id": "npcl",
        "code": "NPCL",
        "name": "Noida Power Company Limited",
        "state": "Uttar Pradesh",
        "short_name": "NPCL",
        "licensee_title": "Assistant General Manager, NPCL",
        "cities": ["Greater Noida"]
    },

    # Delhi
    {
        "id": "brpl_delhi",
        "code": "BRPL",
        "name": "BSES Rajdhani Power Limited",
        "state": "Delhi",
        "short_name": "BSES Rajdhani",
        "licensee_title": "Business Manager, BRPL",
        "cities": ["South Delhi", "West Delhi", "Dwarka", "Janakpuri", "Vasant Kunj", "Saket", "Nehru Place"]
    },
    {
        "id": "bypl_delhi",
        "code": "BYPL",
        "name": "BSES Yamuna Power Limited",
        "state": "Delhi",
        "short_name": "BSES Yamuna",
        "licensee_title": "Business Manager, BYPL",
        "cities": ["Central Delhi", "East Delhi", "Chandni Chowk", "Daryaganj", "Paharganj", "Mayur Vihar", "Laxmi Nagar"]
    },
    {
        "id": "tpddl_delhi",
        "code": "TPDDL",
        "name": "Tata Power Delhi Distribution Limited",
        "state": "Delhi",
        "short_name": "Tata Power Delhi",
        "licensee_title": "Head - Consumer Services, TPDDL",
        "cities": ["North Delhi", "North West Delhi", "Rohini", "Pitampura", "Model Town", "Civil Lines", "Narela"]
    },

    # Haryana
    {
        "id": "dhbvn",
        "code": "DHBVN",
        "name": "Dakshin Haryana Bijli Vitran Nigam",
        "state": "Haryana",
        "short_name": "DHBVN",
        "licensee_title": "Executive Engineer (OP), DHBVN",
        "cities": ["Gurugram", "Faridabad", "Hisar", "Sirsa", "Fatehabad", "Jind", "Bhiwani", "Charkhi Dadri", "Rewari", "Mahendragarh", "Palwal", "Nuh"]
    },
    {
        "id": "uhbvn",
        "code": "UHBVN",
        "name": "Uttar Haryana Bijli Vitran Nigam",
        "state": "Haryana",
        "short_name": "UHBVN",
        "licensee_title": "Executive Engineer (OP), UHBVN",
        "cities": ["Panchkula", "Ambala", "Yamunanagar", "Kurukshetra", "Kaithal", "Karnal", "Panipat", "Sonipat", "Rohtak", "Jhajjar"]
    },

    # Punjab
    {
        "id": "pspcl",
        "code": "PSPCL",
        "name": "Punjab State Power Corporation Limited",
        "state": "Punjab",
        "short_name": "PSPCL",
        "licensee_title": "Senior Executive Engineer (DS), PSPCL",
        "cities": ["Amritsar", "Ludhiana", "Jalandhar", "Patiala", "Bathinda", "Mohali", "Hoshiarpur", "Pathankot", "Moga"]
    },

    # Tamil Nadu
    {
        "id": "tangedco",
        "code": "TANGEDCO",
        "name": "Tamil Nadu Generation and Distribution Corporation Limited",
        "state": "Tamil Nadu",
        "short_name": "TANGEDCO",
        "licensee_title": "Executive Engineer (O&M), TANGEDCO",
        "cities": ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem", "Tirunelveli", "Tiruppur", "Erode", "Vellore"]
    },

    # Telangana
    {
        "id": "tsspdcl",
        "code": "TSSPDCL",
        "name": "Southern Power Distribution Company of Telangana Limited",
        "state": "Telangana",
        "short_name": "TSSPDCL",
        "licensee_title": "Divisional Engineer (Operations), TSSPDCL",
        "cities": ["Hyderabad", "Ranga Reddy", "Medchal-Malkajgiri", "Nalgonda", "Mahabubnagar", "Suryapet", "Yadadri Bhuvanagiri", "Nagarkurnool", "Wanaparthy", "Jogulamba Gadwal", "Narayanpet", "Vikarabad", "Medak", "Siddipet", "Sangareddy"]
    },
    {
        "id": "tsnpdcl",
        "code": "TSNPDCL",
        "name": "Northern Power Distribution Company of Telangana Limited",
        "state": "Telangana",
        "short_name": "TSNPDCL",
        "licensee_title": "Divisional Engineer (Operations), TSNPDCL",
        "cities": ["Warangal", "Hanumakonda", "Karimnagar", "Khammam", "Nizamabad", "Adilabad", "Mancherial", "Nirmal", "Komaram Bheem", "Peddapalli", "Jagitial", "Rajanna Sircilla", "Bhadradri Kothagudem", "Mahabubabad", "Jayashankar Bhupalpally", "Jangaon", "Mulugu"]
    },

    # Andhra Pradesh
    {
        "id": "apepdcl",
        "code": "APEPDCL",
        "name": "Eastern Power Distribution Company of AP Limited",
        "state": "Andhra Pradesh",
        "short_name": "APEPDCL",
        "licensee_title": "Executive Engineer (Operations), APEPDCL",
        "cities": ["Visakhapatnam", "Srikakulam", "Vizianagaram", "East Godavari", "West Godavari", "Eluru", "Kakinada", "Konaseema", "Alluri Sitharama Raju", "Parvathipuram Manyam", "Anakapalli"]
    },
    {
        "id": "apspdcl",
        "code": "APSPDCL",
        "name": "Southern Power Distribution Company of AP Limited",
        "state": "Andhra Pradesh",
        "short_name": "APSPDCL",
        "licensee_title": "Executive Engineer (Operations), APSPDCL",
        "cities": ["Tirupati", "Nellore", "Chittoor", "Kadapa", "Anantapur", "Kurnool", "Nandyal", "Sri Sathya Sai", "Annamayya"]
    },
    {
        "id": "apcpdcl",
        "code": "APCPDCL",
        "name": "Central Power Distribution Company of AP Limited",
        "state": "Andhra Pradesh",
        "short_name": "APCPDCL",
        "licensee_title": "Executive Engineer (Operations), APCPDCL",
        "cities": ["Vijayawada", "Guntur", "Krishna", "Prakasam", "Bapatla", "Palnadu", "NTR District"]
    },

    # Kerala
    {
        "id": "ksebl",
        "code": "KSEBL",
        "name": "Kerala State Electricity Board Limited",
        "state": "Kerala",
        "short_name": "KSEBL",
        "licensee_title": "Assistant Executive Engineer, Electrical Sub Division, KSEBL",
        "cities": ["Thiruvananthapuram", "Kochi", "Kozhikode", "Kollam", "Thrissur", "Kannur", "Palakkad", "Kottayam", "Malappuram", "Alappuzha", "Kasaragod", "Idukki", "Wayanad", "Pathanamthitta"]
    },

    # West Bengal
    {
        "id": "wbsedcl",
        "code": "WBSEDCL",
        "name": "West Bengal State Electricity Distribution Company Limited",
        "state": "West Bengal",
        "short_name": "WBSEDCL",
        "licensee_title": "Divisional Manager, WBSEDCL",
        "cities": ["Kolkata Suburban", "Howrah", "North 24 Parganas", "South 24 Parganas", "Hooghly", "Purba Medinipur", "Paschim Medinipur", "Burdwan", "Siliguri", "Darjeeling", "Malda", "Murshidabad", "Nadia", "Bankura", "Birbhum", "Purulia", "Jalpaiguri", "Cooch Behar", "Alipurduar", "Uttar Dinajpur", "Dakshin Dinajpur"]
    },
    {
        "id": "cesc_kolkata",
        "code": "CESC",
        "name": "Calcutta Electric Supply Corporation Limited",
        "state": "West Bengal",
        "short_name": "CESC Kolkata",
        "licensee_title": "District Engineer, CESC Limited",
        "cities": ["Kolkata City", "Howrah City"]
    },

    # Bihar
    {
        "id": "nbpdcl",
        "code": "NBPDCL",
        "name": "North Bihar Power Distribution Company Limited",
        "state": "Bihar",
        "short_name": "NBPDCL",
        "licensee_title": "Executive Engineer (Electric Supply), NBPDCL",
        "cities": ["Muzaffarpur", "Darbhanga", "Saharsa", "Purnia", "Chhapra", "Motihari", "Bettiah", "Samastipur", "Madhubani", "Sitamarhi", "Katihar", "Kishanganj", "Araria", "Supaul", "Madhepura", "Siwan", "Gopalganj", "Sheohar", "Vaishali"]
    },
    {
        "id": "sbpdcl",
        "code": "SBPDCL",
        "name": "South Bihar Power Distribution Company Limited",
        "state": "Bihar",
        "short_name": "SBPDCL",
        "licensee_title": "Executive Engineer (Electric Supply), SBPDCL",
        "cities": ["Patna", "Gaya", "Bhagalpur", "Munger", "Nalanda", "Rohtas", "Bhojpur", "Buxar", "Kaimur", "Jehanabad", "Arwal", "Aurangabad", "Nawada", "Jamui", "Lakhisarai", "Sheikhpura", "Banka"]
    },

    # Odisha
    {
        "id": "tpcodl",
        "code": "TPCODL",
        "name": "TP Central Odisha Distribution Limited",
        "state": "Odisha",
        "short_name": "TPCODL",
        "licensee_title": "Executive Engineer (Electrical), TPCODL",
        "cities": ["Bhubaneswar", "Cuttack", "Puri", "Khurda", "Nayagarh", "Kendrapara", "Jagatsinghpur", "Jajpur", "Dhenkanal", "Angul"]
    },
    {
        "id": "tpwodl",
        "code": "TPWODL",
        "name": "TP Western Odisha Distribution Limited",
        "state": "Odisha",
        "short_name": "TPWODL",
        "licensee_title": "Executive Engineer (Electrical), TPWODL",
        "cities": ["Sambalpur", "Rourkela", "Bargarh", "Jharsuguda", "Deogarh", "Sundargarh", "Bolangir", "Sonepur", "Kalahandi", "Nuapada"]
    },
    {
        "id": "tpnodl",
        "code": "TPNODL",
        "name": "TP Northern Odisha Distribution Limited",
        "state": "Odisha",
        "short_name": "TPNODL",
        "licensee_title": "Executive Engineer (Electrical), TPNODL",
        "cities": ["Balasore", "Bhadrak", "Baripada", "Mayurbhanj", "Keonjhar", "Jajpur Road"]
    },
    {
        "id": "tpsodl",
        "code": "TPSODL",
        "name": "TP Southern Odisha Distribution Limited",
        "state": "Odisha",
        "short_name": "TPSODL",
        "licensee_title": "Executive Engineer (Electrical), TPSODL",
        "cities": ["Berhampur", "Ganjam", "Gajapati", "Rayagada", "Koraput", "Nabarangpur", "Malkangiri", "Kandhamal", "Boudh"]
    },

    # Chhattisgarh
    {
        "id": "cspdcl",
        "code": "CSPDCL",
        "name": "Chhattisgarh State Power Distribution Company Limited",
        "state": "Chhattisgarh",
        "short_name": "CSPDCL",
        "licensee_title": "Executive Engineer (O&M), CSPDCL",
        "cities": ["Raipur", "Bhilai", "Durg", "Bilaspur", "Korba", "Rajnandgaon", "Jagdalpur", "Ambikapur", "Raigarh", "Dhamtari"]
    },

    # Jharkhand
    {
        "id": "jbvnl",
        "code": "JBVNL",
        "name": "Jharkhand Bijli Vitran Nigam Limited",
        "state": "Jharkhand",
        "short_name": "JBVNL",
        "licensee_title": "Executive Engineer (Electric Supply), JBVNL",
        "cities": ["Ranchi", "Jamshedpur", "Dhanbad", "Bokaro", "Deoghar", "Hazaribagh", "Giridih", "Ramgarh", "Medininagar", "Chaibasa"]
    },

    # Uttarakhand
    {
        "id": "upcl",
        "code": "UPCL",
        "name": "Uttarakhand Power Corporation Limited",
        "state": "Uttarakhand",
        "short_name": "UPCL",
        "licensee_title": "Executive Engineer (Distribution), UPCL",
        "cities": ["Dehradun", "Haridwar", "Roorkee", "Haldwani", "Rudraprayag", "Nainital", "Kashipur", "Rishikesh", "Pithoragarh"]
    },

    # Himachal Pradesh
    {
        "id": "hpsebl",
        "code": "HPSEBL",
        "name": "Himachal Pradesh State Electricity Board Limited",
        "state": "Himachal Pradesh",
        "short_name": "HPSEBL",
        "licensee_title": "Senior Executive Engineer (Electrical), HPSEBL",
        "cities": ["Shimla", "Dharamshala", "Mandi", "Solan", "Kullu", "Una", "Hamirpur", "Bilaspur", "Chamba", "Sirmaur"]
    },

    # Goa
    {
        "id": "ged_goa",
        "code": "GED",
        "name": "Electricity Department, Government of Goa",
        "state": "Goa",
        "short_name": "Goa Electricity Dept",
        "licensee_title": "Executive Engineer, Electricity Department Goa",
        "cities": ["Panaji", "Margao", "Vasco da Gama", "Mapusa", "Ponda", "Bicholim"]
    },

    # Assam & Northeast
    {
        "id": "apdcl",
        "code": "APDCL",
        "name": "Assam Power Distribution Company Limited",
        "state": "Assam",
        "short_name": "APDCL",
        "licensee_title": "Assistant General Manager, Electrical Division, APDCL",
        "cities": ["Guwahati", "Dibrugarh", "Silchar", "Jorhat", "Nagaon", "Tinsukia", "Tezpur", "Bongaigaon"]
    },
    {
        "id": "mepdcl",
        "code": "MePDCL",
        "name": "Meghalaya Power Distribution Corporation Limited",
        "state": "Meghalaya",
        "short_name": "MePDCL",
        "licensee_title": "Executive Engineer, MePDCL",
        "cities": ["Shillong", "Tura", "Jowai", "Nongstoin"]
    },
    {
        "id": "tsecl",
        "code": "TSECL",
        "name": "Tripura State Electricity Corporation Limited",
        "state": "Tripura",
        "short_name": "TSECL",
        "licensee_title": "Senior Manager (Electrical), TSECL",
        "cities": ["Agartala", "Dharmanagar", "Udaipur", "Kailashahar"]
    }
]

# Quick lookup index by code and id (case-insensitive)
_DISCOM_BY_ID: Dict[str, Dict[str, Any]] = {d["id"].lower(): d for d in DISCOMS_DATA}
_DISCOM_BY_CODE: Dict[str, Dict[str, Any]] = {d["code"].upper(): d for d in DISCOMS_DATA}

def get_all_discoms() -> List[Dict[str, Any]]:
    """Return all DISCOMs sorted by state and name."""
    return sorted(DISCOMS_DATA, key=lambda x: (x["state"], x["name"]))

def get_discom_by_identifier(identifier: Optional[str]) -> Optional[Dict[str, Any]]:
    """Look up DISCOM by ID, code, or name match."""
    if not identifier:
        return None
    raw = str(identifier).strip()
    # 1. Exact ID
    if raw.lower() in _DISCOM_BY_ID:
        return _DISCOM_BY_ID[raw.lower()]
    # 2. Exact Code
    if raw.upper() in _DISCOM_BY_CODE:
        return _DISCOM_BY_CODE[raw.upper()]
    # 3. Match code or name substring
    raw_lower = raw.lower()
    for d in DISCOMS_DATA:
        if (
            d["code"].lower() == raw_lower
            or d["id"].lower() == raw_lower
            or raw_lower in d["name"].lower()
            or raw_lower in d["short_name"].lower()
        ):
            return d
    return None

def search_discoms(query: Optional[str] = None, state: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Search DISCOMs by:
    - DISCOM Name
    - Abbreviation / Code
    - State
    - City / Area
    """
    results = DISCOMS_DATA
    if state and state.strip() and state.strip().lower() != "all":
        st = state.strip().lower()
        results = [d for d in results if d["state"].lower() == st]

    if query and query.strip():
        q = query.strip().lower()
        matched = []
        for d in results:
            if (
                q in d["name"].lower()
                or q in d["code"].lower()
                or q in d["state"].lower()
                or q in d["short_name"].lower()
                or any(q in city.lower() for city in d.get("cities", []))
            ):
                matched.append(d)
        return matched

    return results

# Default document mapping fallback:
# Generic documents like WCR, SLDR, Annexure, Agreements are available by default across DISCOMs,
# but can be customized per tenant / DISCOM.
DEFAULT_DOCUMENT_MAPPINGS: Dict[str, List[str]] = {
    # Default mapped templates for all DISCOMs if no custom mapping exists
    "DEFAULT": ["wcr", "sldr", "meter_testing_request", "net_meter_agreement", "vendor_agreement", "annexure"],
    # Specific DISCOM customizations can map specific templates
    "MSEDCL": ["wcr", "sldr", "meter_testing_request", "net_meter_agreement", "vendor_agreement", "annexure"],
    "JVVNL": ["wcr", "sldr", "meter_testing_request", "net_meter_agreement", "vendor_agreement", "annexure"],
    "AVVNL": ["wcr", "sldr", "meter_testing_request", "net_meter_agreement", "vendor_agreement", "annexure"],
    "JdVVNL": ["wcr", "sldr", "meter_testing_request", "net_meter_agreement", "vendor_agreement", "annexure"],
    "DGVCL": ["wcr", "sldr", "meter_testing_request", "net_meter_agreement", "vendor_agreement", "annexure"],
    "MGVCL": ["wcr", "sldr", "meter_testing_request", "net_meter_agreement", "vendor_agreement", "annexure"],
    "PGVCL": ["wcr", "sldr", "meter_testing_request", "net_meter_agreement", "vendor_agreement", "annexure"],
    "UGVCL": ["wcr", "sldr", "meter_testing_request", "net_meter_agreement", "vendor_agreement", "annexure"],
    "BESCOM": ["wcr", "sldr", "meter_testing_request", "net_meter_agreement", "vendor_agreement", "annexure"],
}
