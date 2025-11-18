const express = require('express');
const { body, validationResult } = require('express-validator');
const { Course, CourseOffering, sequelize } = require('../models');
const { Op } = require('sequelize');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ==================== 课程目录相关接口 ====================

// 获取所有课程目录
router.get('/courses', async (req, res) => {
  try {
    const { page = 1, limit = 20, dept, search } = req.query;
    const offset = (page - 1) * limit;

    // 构建查询条件
    const whereClause = {};
    if (dept) {
      whereClause.dept = dept;
    }
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { code: { [Op.like]: `%${search}%` } }
      ];
    }

    const { count, rows: courses } = await Course.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']],
      include: [
        {
          model: CourseOffering,
          as: 'offerings',
          required: false,
          limit: 5,
          order: [['created_at', 'DESC']]
        }
      ]
    });

    res.json({
      status: 'success',
      message: 'Courses retrieved successfully',
      data: {
        courses,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    console.error('获取课程目录失败:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve courses',
      error: error.message
    });
  }
});

// 根据ID获取单个课程目录
router.get('/courses/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const course = await Course.findByPk(id, {
      include: [
        {
          model: CourseOffering,
          as: 'offerings',
          required: false,
          order: [['created_at', 'DESC']]
        }
      ]
    });

    if (!course) {
      return res.status(404).json({
        status: 'error',
        message: 'Course not found'
      });
    }

    res.json({
      status: 'success',
      message: 'Course retrieved successfully',
      data: { course }
    });
  } catch (error) {
    console.error('获取课程详情失败:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve course',
      error: error.message
    });
  }
});

// 创建课程目录
router.post('/courses', 
  authenticateToken,
  [
    body('code').notEmpty().withMessage('Course code is required'),
    body('name').notEmpty().withMessage('Course name is required'),
    body('dept').optional().isString(),
    body('description').optional().isString()
  ],
  async (req, res) => {
    try {
      // 验证输入
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { code, name, dept, description } = req.body;

      // 检查课程编号是否已存在
      const existingCourse = await Course.findOne({
        where: { code: code }
      });

      if (existingCourse) {
        return res.status(400).json({
          status: 'error',
          message: 'Course code already exists'
        });
      }

      // 创建课程
      const newCourse = await Course.create({
        code,
        name,
        dept,
        description
      });

      res.status(201).json({
        status: 'success',
        message: 'Course created successfully',
        data: { course: newCourse }
      });
    } catch (error) {
      console.error('创建课程失败:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to create course',
        error: error.message
      });
    }
  }
);

// 更新课程目录
router.put('/courses/:id',
  authenticateToken,
  [
    body('code').optional().notEmpty().withMessage('Course code cannot be empty'),
    body('name').optional().notEmpty().withMessage('Course name cannot be empty'),
    body('dept').optional().isString(),
    body('description').optional().isString()
  ],
  async (req, res) => {
    try {
      // 验证输入
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { id } = req.params;
      const { code, name, dept, description } = req.body;

      // 查找课程
      const course = await Course.findByPk(id);
      if (!course) {
        return res.status(404).json({
          status: 'error',
          message: 'Course not found'
        });
      }

      // 如果更新课程编号，检查是否与其他课程冲突
      if (code && code !== course.code) {
        const existingCourse = await Course.findOne({
          where: { 
            code: code,
            id: { [Op.ne]: id }
          }
        });

        if (existingCourse) {
          return res.status(400).json({
            status: 'error',
            message: 'Course code already exists'
          });
        }
      }

      // 更新课程
      await course.update({
        code: code || course.code,
        name: name || course.name,
        dept: dept !== undefined ? dept : course.dept,
        description: description !== undefined ? description : course.description
      });

      res.json({
        status: 'success',
        message: 'Course updated successfully',
        data: { course }
      });
    } catch (error) {
      console.error('更新课程失败:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to update course',
        error: error.message
      });
    }
  }
);

// 删除课程目录（需要管理员权限）
router.delete('/courses/:id',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;

      // 查找课程
      const course = await Course.findByPk(id);
      if (!course) {
        return res.status(404).json({
          status: 'error',
          message: 'Course not found'
        });
      }

      // 检查是否有开课实例
      const offeringCount = await CourseOffering.count({
        where: { course_id: id }
      });

      if (offeringCount > 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Cannot delete course with existing offerings',
          data: { offeringCount }
        });
      }

      // 删除课程
      await course.destroy();

      res.json({
        status: 'success',
        message: 'Course deleted successfully'
      });
    } catch (error) {
      console.error('删除课程失败:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to delete course',
        error: error.message
      });
    }
  }
);


// ==================== 开课实例相关接口 ====================

// 获取所有开课实例
router.get('/offerings', async (req, res) => {
  try {
    const { page = 1, limit = 20, course_id, term, instructor } = req.query;
    const offset = (page - 1) * limit;

    // 构建查询条件
    const whereClause = {};
    if (course_id) {
      whereClause.course_id = course_id;
    }
    if (term) {
      whereClause.term = { [Op.like]: `%${term}%` };
    }
    if (instructor) {
      // instructor现在是JSON数组，需要使用JSON函数查询
      whereClause[Op.or] = [
        sequelize.literal(`JSON_CONTAINS(instructor, JSON_QUOTE('${instructor}'))`),
        sequelize.literal(`JSON_SEARCH(instructor, 'one', '%${instructor}%') IS NOT NULL`)
      ];
    }

    const { count, rows: offerings } = await CourseOffering.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']],
      include: [
        {
          model: Course,
          as: 'course',
          required: true
        }
      ]
    });

    res.json({
      status: 'success',
      message: 'Course offerings retrieved successfully',
      data: {
        offerings,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    console.error('获取开课实例失败:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve course offerings',
      error: error.message
    });
  }
});

// 根据ID获取单个开课实例
router.get('/offerings/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const offering = await CourseOffering.findByPk(id, {
      include: [
        {
          model: Course,
          as: 'course',
          required: true
        }
      ]
    });

    if (!offering) {
      return res.status(404).json({
        status: 'error',
        message: 'Course offering not found'
      });
    }

    res.json({
      status: 'success',
      message: 'Course offering retrieved successfully',
      data: { offering }
    });
  } catch (error) {
    console.error('获取开课实例详情失败:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve course offering',
      error: error.message
    });
  }
});

// 创建开课实例（需要管理员权限）
router.post('/offerings',
  authenticateToken,
  [
    body('course_id').isInt().withMessage('Course ID must be an integer'),
    body('term').notEmpty().withMessage('Term is required'),
    body('section').optional().isString(),
    body('instructor').optional().custom((value) => {
      // 支持字符串或字符串数组
      if (typeof value === 'string' || Array.isArray(value)) {
        return true;
      }
      throw new Error('Instructor must be a string or an array of strings');
    }),
    body('schedule_json').optional().isObject(),
    body('extra_info').optional().isString()
  ],
  async (req, res) => {
    try {
      // 验证输入
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { course_id, term, section, instructor, schedule_json, extra_info } = req.body;

      // 检查课程是否存在
      const course = await Course.findByPk(course_id);
      if (!course) {
        return res.status(404).json({
          status: 'error',
          message: 'Course not found'
        });
      }

      // 处理instructor：如果是字符串，转换为数组；如果是数组，过滤空值
      let instructorArray = null;
      if (instructor) {
        if (typeof instructor === 'string') {
          instructorArray = instructor.trim() ? [instructor.trim()] : null;
        } else if (Array.isArray(instructor)) {
          instructorArray = instructor.filter(i => i && typeof i === 'string' && i.trim()).map(i => i.trim());
          if (instructorArray.length === 0) {
            instructorArray = null;
          }
        }
      }

      // 检查同一课程、学期、班号的组合是否已存在
      const existingOffering = await CourseOffering.findOne({
        where: {
          course_id,
          term,
          section: section || null
        }
      });

      if (existingOffering) {
        return res.status(400).json({
          status: 'error',
          message: 'Course offering with same course, term and section already exists'
        });
      }

      // 创建开课实例
      const newOffering = await CourseOffering.create({
        course_id,
        term,
        section,
        instructor: instructorArray,
        schedule_json,
        extra_info
      });

      // 重新查询以包含关联的课程信息
      const offeringWithCourse = await CourseOffering.findByPk(newOffering.id, {
        include: [
          {
            model: Course,
            as: 'course',
            required: true
          }
        ]
      });

      res.status(201).json({
        status: 'success',
        message: 'Course offering created successfully',
        data: { offering: offeringWithCourse }
      });
    } catch (error) {
      console.error('创建开课实例失败:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to create course offering',
        error: error.message
      });
    }
  }
);

// 更新开课实例（需要管理员权限）
router.put('/offerings/:id',
  authenticateToken,
  [
    body('course_id').optional().isInt().withMessage('Course ID must be an integer'),
    body('term').optional().notEmpty().withMessage('Term cannot be empty'),
    body('section').optional().isString(),
    body('instructor').optional().isString(),
    body('schedule_json').optional().isObject(),
    body('extra_info').optional().isString()
  ],
  async (req, res) => {
    try {
      // 验证输入
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { id } = req.params;
      const { course_id, term, section, instructor, schedule_json, extra_info } = req.body;

      // 查找开课实例
      const offering = await CourseOffering.findByPk(id);
      if (!offering) {
        return res.status(404).json({
          status: 'error',
          message: 'Course offering not found'
        });
      }

      // 如果更新课程ID，检查课程是否存在
      if (course_id && course_id !== offering.course_id) {
        const course = await Course.findByPk(course_id);
        if (!course) {
          return res.status(404).json({
            status: 'error',
            message: 'Course not found'
          });
        }
      }

      // 如果更新学期或班号，检查是否与其他实例冲突
      const newTerm = term || offering.term;
      const newSection = section !== undefined ? section : offering.section;
      const newCourseId = course_id || offering.course_id;

      if (newTerm !== offering.term || newSection !== offering.section || newCourseId !== offering.course_id) {
        const existingOffering = await CourseOffering.findOne({
          where: {
            course_id: newCourseId,
            term: newTerm,
            section: newSection,
            id: { [Op.ne]: id }
          }
        });

        if (existingOffering) {
          return res.status(400).json({
            status: 'error',
            message: 'Course offering with same course, term and section already exists'
          });
        }
      }

      // 更新开课实例
      await offering.update({
        course_id: course_id || offering.course_id,
        term: term || offering.term,
        section: section !== undefined ? section : offering.section,
        instructor: instructor !== undefined ? instructor : offering.instructor,
        schedule_json: schedule_json !== undefined ? schedule_json : offering.schedule_json,
        extra_info: extra_info !== undefined ? extra_info : offering.extra_info
      });

      // 重新查询以包含关联的课程信息
      const updatedOffering = await CourseOffering.findByPk(id, {
        include: [
          {
            model: Course,
            as: 'course',
            required: true
          }
        ]
      });

      res.json({
        status: 'success',
        message: 'Course offering updated successfully',
        data: { offering: updatedOffering }
      });
    } catch (error) {
      console.error('更新开课实例失败:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to update course offering',
        error: error.message
      });
    }
  }
);

// 删除开课实例（需要管理员权限）
router.delete('/offerings/:id',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;

      // 查找开课实例
      const offering = await CourseOffering.findByPk(id);
      if (!offering) {
        return res.status(404).json({
          status: 'error',
          message: 'Course offering not found'
        });
      }

      // 删除开课实例
      await offering.destroy();

      res.json({
        status: 'success',
        message: 'Course offering deleted successfully'
      });
    } catch (error) {
      console.error('删除开课实例失败:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to delete course offering',
        error: error.message
      });
    }
  }
);

// ==================== 统计信息接口 ====================

// 获取课程统计信息
router.get('/stats', async (req, res) => {
  try {
    const totalCourses = await Course.count();
    const totalOfferings = await CourseOffering.count();
    
    // 按院系统计课程数量
    const coursesByDept = await Course.findAll({
      attributes: [
        'dept',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['dept'],
      order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']]
    });

    // 按学期统计开课数量
    const offeringsByTerm = await CourseOffering.findAll({
      attributes: [
        'term',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['term'],
      order: [['term', 'DESC']]
    });

    res.json({
      status: 'success',
      message: 'Statistics retrieved successfully',
      data: {
        totalCourses,
        totalOfferings,
        coursesByDept,
        offeringsByTerm
      }
    });
  } catch (error) {
    console.error('获取统计信息失败:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve statistics',
      error: error.message
    });
  }
});

module.exports = router;
