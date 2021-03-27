var Mongoose = require('mongoose');
var Tree = require('../lib/tree');
var Async = require('async');
var should = require('should');
var _ = require('lodash');
var shortId = require('shortid');
var util = require('util');

var Schema = Mongoose.Schema;

Mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mongoose-path-tree');

Mongoose.Promise = require('bluebird');

describe('tree tests', function () {

    var userSchema = {
        name: String
    };

    var pluginOptions = {
        pathSeparator: '.'
    };

    if (process.env.MONGOOSE_TREE_SHORTID === '1') {
        userSchema._id = {
            type: String,
            unique: true,
            'default': function(){
                return shortId.generate();
            }
        };

        pluginOptions.idType = String
    }

    // Schema for tests
    var UserSchema = new Schema(userSchema);
    UserSchema.plugin(Tree, pluginOptions);
    var User = Mongoose.model('User', UserSchema);

    // Set up the fixture
    beforeEach(function (done) {

        User.remove({}, function (err) {

            should.not.exist(err);

            var adam = new User({name: 'Adam' });
            var eden = new User({name: 'Eden' });
            var bob = new User({name: 'Bob', parent: adam });
            var carol = new User({name: 'Carol', parent: adam });
            var dann = new User({name: 'Dann', parent: carol });
            var emily = new User({name: 'Emily', parent: dann });
            var joe = new User({name: 'Joe'});
            var paul = new User({name: 'Paul', parent: joe});

            Async.forEachSeries([adam, bob, carol, dann, emily, eden, joe, paul], function (doc, cb) {

                doc.save(cb);
            }, done);
        });
    });


    describe('adding documents', function () {

        it('should set parent id, path, and level', function (done) {

            User.find({}, function (err, users) {

                should.not.exist(err);

                var names = {};
                users.forEach(function (user) {

                    names[user.name] = user;
                });

                should.not.exist(names['Adam'].parent);
                names['Bob'].parent.toString().should.equal(names['Adam']._id.toString());
                names['Carol'].parent.toString().should.equal(names['Adam']._id.toString());
                names['Dann'].parent.toString().should.equal(names['Carol']._id.toString());
                names['Emily'].parent.toString().should.equal(names['Dann']._id.toString());

                var expectedPath = [names['Adam']._id, names['Carol']._id, names['Dann']._id].join('.');
                names['Dann'].path.should.equal(expectedPath);

                // Level tests
                names['Adam'].level.should.equal(1);
                names['Bob'].level.should.equal(2);
                names['Dann'].level.should.equal(3);
                names['Emily'].level.should.equal(4);

                done();
            });
        });
    });


    describe('removing document', function () {

        it('should remove leaf nodes', function (done) {

            User.findOne({ name: 'Emily' }, function (err, emily) {

                emily.remove(function (err) {

                    should.not.exist(err);

                    User.find(function (err, users) {

                        should.not.exist(err);
                        users.length.should.equal(7);
                        _.map(users, 'name').should.not.containEql('Emily');
                        done();
                    });
                });
            });
        });

        it('should remove all children', function (done) {

            User.findOne({ name: 'Carol' }, function (err, user) {

                should.not.exist(err);

                user.remove(function (err) {

                    should.not.exist(err);

                    User.find(function (err, users) {

                        should.not.exist(err);

                        users.length.should.equal(5);
                        _.map(users, 'name').should.containEql('Adam').and.containEql('Bob');
                        done();
                    });
                });
            });
        });
    });


    function checkPaths(done) {
        User.find({}, function (err, users) {

            should.not.exist(err);

            var ids = {};
            users.forEach(function (user) {

                ids[user._id] = user;
            });

            users.forEach(function (user) {

                if (!user.parent) {
                    return;
                }
                should.exist(ids[user.parent]);
                user.path.should.equal(ids[user.parent].path + "." + user._id);
            });

            done();
        });
    }


    describe('moving documents', function () {

        it('should change children paths and update level', function (done) {

            User.find({}, function (err, users) {
                should.not.exist(err);

                var names = {};
                users.forEach(function (user) {
                    names[user.name] = user;
                });

                var carol = names['Carol'];
                var bob = names['Bob'];

                carol.parent = bob;
                carol.save(function (err) {
                    User.find({}, function (err, users) {
                        should.not.exist(err);

                        var names = {};

                        users.forEach(function (user) {
                            names[user.name] = user;
                        });

                        carol.level.should.equal(3);
                        names['Dann'].level.should.equal(4);
                        names['Emily'].level.should.equal(5);

                        checkPaths(done);
                    });
                });
            });
        });


    });


    describe('get children', function () {

        it('should return immediate children with filters', function (done) {

            User.findOne({name: 'Adam'}, function (err, adam) {

                should.not.exist(err);
                adam.getChildren({name: 'Bob'}, function (err, users) {

                    should.not.exist(err);
                    users.length.should.equal(1);
                    _.map(users, 'name').should.containEql('Bob');
                    done();
                });
            });
        });

        it('should return immediate children', function (done) {

            User.findOne({name: 'Adam'}, function (err, adam) {

                should.not.exist(err);

                adam.getChildren(function (err, users) {

                    should.not.exist(err);

                    users.length.should.equal(2);
                    _.map(users, 'name').should.containEql('Bob').and.containEql('Carol');
                    done();
                });
            });
        });

        it('should return recursive children', function (done) {

            User.findOne({ 'name': 'Carol' }, function (err, carol) {

                should.not.exist(err);

                carol.getChildren(true, function (err, users) {

                    should.not.exist(err);

                    users.length.should.equal(2);
                    _.map(users, 'name').should.containEql('Dann').and.containEql('Emily');
                    done();
                });
            });
        });

        it('should return children with only name and _id fields', function (done) {

            User.findOne({ 'name': 'Carol' }, function (err, carol) {

                should.not.exist(err);

                carol.getChildren({}, 'name', true, function (err, users) {

                    should.not.exist(err);

                    users.length.should.equal(2);
                    users[0].toObject().should.not.have.property('parent');
                    _.map(users, 'name').should.containEql('Dann').and.containEql('Emily');
                    done();
                });
            });
        });

        it('should return children sorted on name', function (done) {

            User.findOne({ 'name': 'Carol' }, function (err, carol) {

                should.not.exist(err);

                carol.getChildren({}, null, {sort: {name: -1}}, true, function (err, users) {

                    should.not.exist(err);

                    users.length.should.equal(2);
                    users[0].name.should.equal('Emily');
                    _.map(users, 'name').should.containEql('Dann').and.containEql('Emily');
                    done();
                });
            });
        });
    });

    describe('get ancestors (instance)', function () {

        it('should return ancestors', function (done) {

            User.findOne({ 'name': 'Dann' }, function (err, dann) {

                dann.getAncestors(function (err, ancestors) {
                    should.not.exist(err);
                    ancestors.length.should.equal(2);
                    _.map(ancestors, 'name').should.containEql('Carol').and.containEql('Adam');
                    done();
                });
            });
        });


        it('should return ancestors with only name and _id fields', function (done) {

            User.findOne({ 'name': 'Dann' }, function (err, dann) {

                dann.getAncestors({}, 'name', function (err, ancestors) {
                    should.not.exist(err);

                    ancestors.length.should.equal(2);
                    ancestors[0].toObject().should.not.have.property('parent');
                    ancestors[0].should.have.property('name');
                    _.map(ancestors, 'name').should.containEql('Carol').and.containEql('Adam');
                    done();
                });
            });
        });


        it('should return ancestors sorted on name and without wrappers', function (done) {

            User.findOne({ 'name': 'Dann' }, function (err, dann) {

                dann.getAncestors({}, null, {sort: {name: -1}, lean: 1}, function (err, ancestors) {
                    should.not.exist(err);

                    ancestors.length.should.equal(2);
                    ancestors[0].name.should.equal('Carol');
                    should.not.exist(ancestors[0].getAncestors);
                    _.map(ancestors, 'name').should.containEql('Carol').and.containEql('Adam');
                    done();
                });
            });
        });
    });

    describe('get ancestors (static)', function () {

        it('should return ancestors', function (done) {

            User.find({ $or: [{name: 'Paul'}, {name: 'Emily'}]}, function (err, users) {

                User.getAncestors(users, function (err, ancestors) {
                    should.not.exist(err);
                    ancestors.length.should.equal(2);
                    ancestors = [].concat(ancestors[0], ancestors[1]);
                    _.map(ancestors, 'name').should.containEql('Adam').and.containEql('Carol').and.containEql('Dann').and.containEql('Joe');
                    done();
                });
            });
        });


        it('should return ancestors with only name and _id fields', function (done) {

            User.findOne({ 'name': 'Dann' }, function (err, dann) {

                User.getAncestors([dann], {}, 'name', function (err, ancestors) {
                    should.not.exist(err);
                    ancestors = ancestors[0];
                    ancestors.length.should.equal(2);
                    ancestors[0].toObject().should.not.have.property('parent');
                    ancestors[0].should.have.property('name');
                    _.map(ancestors, 'name').should.containEql('Carol').and.containEql('Adam');
                    done();
                });
            });
        });


        it('should return ancestors sorted on name and without wrappers', function (done) {

            User.findOne({ 'name': 'Dann' }, function (err, dann) {

                User.getAncestors([dann], {}, null, {sort: {name: -1}, lean: 1}, function (err, ancestors) {
                    should.not.exist(err);
                    ancestors = ancestors[0];
                    ancestors.length.should.equal(2);
                    ancestors[0].name.should.equal('Carol');
                    should.not.exist(ancestors[0].getAncestors);
                    _.map(ancestors, 'name').should.containEql('Carol').and.containEql('Adam');
                    done();
                });
            });
        });
    });


    describe('get children tree', function () {

        it("should return complete children tree", function (done) {

            User.getChildrenTree(function (err, childrenTree) {

                should.not.exist(err);
                childrenTree.length.should.equal(3);

                var adamTree = _.find(childrenTree, function(x){ return x.name == 'Adam'});
                var edenTree = _.find(childrenTree, function(x){ return x.name == 'Eden'});

                var bobTree = _.find(adamTree.children, function(x){ return x.name == 'Bob'});

                var carolTree = _.find(adamTree.children, function(x){ return x.name == 'Carol'});
                var danTree = _.find(carolTree.children, function(x){ return x.name == 'Dann'});
                var emilyTree = _.find(danTree.children, function(x){ return x.name == 'Emily'});


                adamTree.children.length.should.equal(2);
                edenTree.children.length.should.equal(0);

                bobTree.children.length.should.equal(0);

                carolTree.children.length.should.equal(1);

                danTree.children.length.should.equal(1);
                danTree.children[0].name.should.equal('Emily');

                emilyTree.children.length.should.equal(0);
                done();
            });
        });

        it("should return adam's children tree", function (done) {

            User.findOne({ 'name': 'Adam' }, function (err, adam) {

                adam.getChildrenTree(function (err, childrenTree) {

                    should.not.exist(err);

                    var bobTree = _.find(childrenTree, function(x){ return x.name == 'Bob'});

                    var carolTree = _.find(childrenTree, function(x){ return x.name == 'Carol'});
                    var danTree = _.find(carolTree.children, function(x){ return x.name == 'Dann'});
                    var emilyTree = _.find(danTree.children, function(x){ return x.name == 'Emily'});

                    bobTree.children.length.should.equal(0);
                    carolTree.children.length.should.equal(1);
                    danTree.children.length.should.equal(1);
                    danTree.children[0].name.should.equal('Emily');
                    emilyTree.children.length.should.equal(0);

                    done();
                });
            });
        });
    });
});
